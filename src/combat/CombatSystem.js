import { EV } from '../core/events.js';
import { approachAngle } from '../player/Traversal.js';
import { attackCentre } from './hit.js';

const DEG = Math.PI / 180;

/**
 * Bayu's silat (TECHNICAL §6; GDD pillar "Silat that feels earned: read, step, parry, lock").
 *
 * Actions run on fixed ticks from data/combat/moves.json: strike chains (a press during a strike queues the next),
 * heavy (breaks guards), the counter after a perfect langkah (Buah Bayang opening), langkah (a directional step
 * with invulnerable frames; perfect when started within the window before impact → slow motion and an opening),
 * tangkis (guard; perfect when pressed within the window before impact → the attacker staggers; later → block with
 * chip damage), hit stun, and the Semangat finisher. While an action runs, Traversal is in its `combat` state and
 * this system moves the character (lunges and steps never leave the ground). Health regenerates out of combat.
 */
export class CombatSystem {
  /**
   * @param {object} options
   * @param {import('../player/Traversal.js').Traversal} options.traversal
   * @param {import('../physics/CharacterController.js').CharacterController} options.character
   * @param {import('../core/Input.js').Input} options.input
   * @param {import('../core/Time.js').Time} options.time
   * @param {import('../core/EventBus.js').EventBus} options.bus
   * @param {object} options.data data/combat/moves.json
   * @param {{ has(move: string): boolean }} options.abilities
   * @param {import('../ai/EnemyDirector.js').EnemyDirector} options.director
   * @param {{ get(path: string): any }} options.settings
   */
  constructor({ traversal, character, input, time, bus, data, abilities, director, settings }) {
    Object.assign(this, { traversal, input, time, bus, data, abilities, director, settings });
    this.cc = character;
    /** @type {'idle'|'attack'|'finisher'|'dodge'|'guard'|'hit'} */
    this.state = 'idle';
    /** Ticks into the current action. */
    this.t = 0;
    this.moveName = '';
    this.move = null;
    this.health = data.health.max;
    this.semangat = 0;
    /** Lock-on target (an Enemy) or null; `hardLock` when chosen with the lock button. */
    this.target = null;
    this.hardLock = false;
    this._queued = null;
    this._hitIds = new Set();
    this._dodge = { dirX: 0, dirZ: 0, start: -1e9, last: 0, origin: { x: 0, z: 0 } };
    this._guardStart = -1e9;
    this._recovering = 0;
    this._dodgeCooldown = 0;
    this._invulnerable = 0;
    this._sinceCombat = 999;
    this._counterUntil = -1;
    this._slowMoLeft = 0;
    this._knock = { x: 0, z: 0 };
    this._feet = { x: 0, y: 0, z: 0 };
    this._centre = { x: 0, y: 0, z: 0 };
    /** Camera shake requests (trauma 0..1), read and cleared by the engine. */
    this.trauma = 0;
  }

  /** Whether any threat is near enough to count as a fight. */
  get inCombat() {
    return this.director.threats(this._currentFeet(), this.data.lockOn.combatRange) > 0;
  }

  /** Whether the current dodge ticks are invulnerable. */
  get iFrames() {
    const l = this.data.langkah;
    return this.state === 'dodge' && this.t >= l.iFrom && this.t <= l.iTo;
  }

  /** Where the current langkah began, while it is invulnerable (enemy reach is judged from there). */
  get dodgeOrigin() {
    return this.iFrames ? this._dodge.origin : null;
  }

  /**
   * One fixed tick. Runs before Traversal: when it starts or continues an action it takes the character.
   * @param {number} dt
   * @param {{ x: number, z: number, magnitude: number }} intent
   */
  fixedUpdate(dt, intent) {
    this._updateLock(intent);
    this._regen(dt);
    if (this._invulnerable > 0) this._invulnerable--;
    if (this._dodgeCooldown > 0) this._dodgeCooldown--;
    switch (this.state) {
      case 'idle':
        this._idle(intent);
        break;
      case 'attack':
        this._attackTick(dt, intent);
        break;
      case 'finisher':
        this._finisherTick();
        break;
      case 'dodge':
        this._dodgeTick();
        break;
      case 'guard':
        this._guardTick();
        break;
      case 'hit':
        this._hitTick(dt);
        break;
      default:
        break;
    }
  }

  /**
   * Real-time update (per rendered frame): slow motion runs on real seconds.
   * @param {number} realDt
   */
  frameUpdate(realDt) {
    if (this._slowMoLeft <= 0) return;
    this._slowMoLeft -= realDt;
    if (this._slowMoLeft <= 0) this.time.setScale('langkah', 1);
  }

  /**
   * An enemy strike reaches Bayu (the director calls this once per strike).
   * @param {import('../ai/Enemy.js').Enemy} enemy
   * @returns {'perfectParry'|'block'|'perfectDodge'|'dodge'|'hit'|null}
   */
  receiveStrike(enemy) {
    const now = this.time.tick;
    const perfect = this._perfectTicks();
    if (this.state === 'dodge' && this.iFrames) {
      const isPerfect = now - this._dodge.start <= perfect;
      if (isPerfect) {
        const l = this.data.langkah;
        this.time.setScale('langkah', l.slowMoScale);
        this._slowMoLeft = l.slowMoSeconds;
        this._counterUntil = this.time.gameTime + l.counterSeconds;
        this._addSemangat(l.semangat);
      }
      this.bus.emit(EV.PLAYER_DODGE, { perfect: isPerfect });
      return isPerfect ? 'perfectDodge' : 'dodge';
    }
    if (this._invulnerable > 0) return null;
    const facingEnemy = this._facingDot(enemy.position) > 0;
    if (this.state === 'guard' && facingEnemy) {
      const g = this.data.tangkis;
      if (now - this._guardStart <= perfect) {
        this._addSemangat(g.semangat);
        this.time.hitStop(g.hitStop);
        this.trauma = Math.max(this.trauma, g.shake);
        this.bus.emit(EV.PLAYER_PARRY, { perfect: true });
        return 'perfectParry';
      }
      this._damage(enemy.strike.damage * g.chip, enemy.position, false);
      this._push(enemy.position, g.pushback);
      this.bus.emit(EV.PLAYER_PARRY, { perfect: false });
      return 'block';
    }
    this._damage(enemy.strike.damage, enemy.position, true);
    return 'hit';
  }

  /** Full health and empty actions (encounter restart, respawn). */
  reset() {
    this.health = this.data.health.max;
    this.state = 'idle';
    this.t = 0;
    this.target = null;
    this.hardLock = false;
    this._invulnerable = 0;
    this._slowMoLeft = 0;
    this.time.setScale('langkah', 1);
    this.bus.emit(EV.PLAYER_HEALTH, { health: this.health, max: this.data.health.max });
    this.bus.emit(EV.LOCK_CHANGED, { id: null });
  }

  // -------------------------------------------------------------------------------------------- starting actions

  _idle(intent) {
    if (this.traversal.state !== 'ground' || !this.cc.grounded) return;
    const input = this.input;
    const buffer = this.traversal._bufferTicks;
    const has = (move) => this.abilities.has(move);
    if (
      has('finisher') &&
      this.semangat >= this.data.semangat.finisherCost &&
      input.pressed('kelip') &&
      this.inCombat
    ) {
      input.consume('kelip');
      this._startFinisher();
      return;
    }
    // Langkah while sprinting out of a fight is the slide (Traversal); otherwise it is a step.
    const slideSpeed = this.traversal.tuning.slide.minSpeed;
    if (has('langkah') && this._dodgeCooldown === 0 && input.pressedWithin('langkah', buffer)) {
      if (this.inCombat || this.traversal.speed < slideSpeed || !this.abilities.has('slide')) {
        input.consume('langkah');
        this._startDodge(intent);
        return;
      }
    }
    if (has('tangkis') && input.pressedWithin('tangkis', buffer)) {
      input.consume('tangkis');
      this._startGuard();
      return;
    }
    if (has('strike') && input.pressedWithin('strike', buffer)) {
      input.consume('strike');
      const counter = has('counter') && this.time.gameTime <= this._counterUntil;
      this._startMove(counter ? 'counter' : 'strike_1', intent, true);
      return;
    }
    if (has('heavy') && input.pressedWithin('heavy', buffer)) {
      input.consume('heavy');
      this._startMove('heavy', intent, true);
    }
  }

  _begin(state) {
    this.state = state;
    this.t = 0;
    this._sinceCombat = 0;
    const tv = this.traversal;
    tv.state = 'combat';
    tv.velocity.x = tv.velocity.y = tv.velocity.z = 0;
    tv.speed = 0;
  }

  _end() {
    this.state = 'idle';
    this.t = 0;
    this.move = null;
    this.moveName = '';
    const tv = this.traversal;
    tv.state = this.cc.grounded ? 'ground' : 'air';
  }

  _startMove(name, intent, snap) {
    const move = this.data.player.moves[name];
    this.move = move;
    this.moveName = name;
    this._queued = null;
    this._hitIds.clear();
    this._begin('attack');
    this._face(intent, snap ? Math.PI : 0);
    if (name === 'counter') this._counterUntil = -1;
    const seconds = (move.startup + move.active + move.recovery) / 60;
    this.bus.emit(EV.PLAYER_ATTACK, { move: name });
    this.bus.emit(EV.COMBAT_ACTION, { action: 'attack', move: name, clip: move.clip, seconds });
  }

  _startFinisher() {
    const f = this.data.player.finisher;
    this.semangat = 0;
    this.bus.emit(EV.SEMANGAT_CHANGED, { value: 0, max: this.data.semangat.max });
    this.move = f;
    this.moveName = 'finisher';
    this._hitIds.clear();
    this._begin('finisher');
    this._invulnerable = f.startup + f.active + f.recovery;
    const seconds = (f.startup + f.active + f.recovery) / 60;
    this.bus.emit(EV.PLAYER_ATTACK, { move: 'finisher' });
    this.bus.emit(EV.COMBAT_ACTION, { action: 'finisher', move: 'finisher', clip: f.clip, seconds });
  }

  _startDodge(intent) {
    let dx = intent.x;
    let dz = intent.z;
    if (intent.magnitude < 0.2) {
      // No direction: step back from the target, or back from where Bayu faces.
      const facing = this.traversal.facing;
      dx = -Math.sin(facing);
      dz = -Math.cos(facing);
      if (this.target) {
        const p = this.target.position;
        const feet = this._currentFeet();
        const len = Math.hypot(feet.x - p.x, feet.z - p.z) || 1;
        dx = (feet.x - p.x) / len;
        dz = (feet.z - p.z) / len;
      }
    }
    this._dodge.dirX = dx;
    this._dodge.dirZ = dz;
    this._dodge.start = this.time.tick;
    this._dodge.last = 0;
    const feet = this._currentFeet();
    this._dodge.origin.x = feet.x;
    this._dodge.origin.z = feet.z;
    this._begin('dodge');
    if (!this.target) this.traversal.facing = Math.atan2(dx, dz);
    const l = this.data.langkah;
    this.bus.emit(EV.COMBAT_ACTION, {
      action: 'dodge',
      move: 'langkah',
      clip: l.clip,
      seconds: l.ticks / 60,
    });
  }

  _startGuard() {
    this._guardStart = this.time.tick;
    this._recovering = 0;
    this._begin('guard');
    this._face(null, Math.PI);
    const g = this.data.tangkis;
    this.bus.emit(EV.COMBAT_ACTION, {
      action: 'guard',
      move: 'tangkis',
      clip: g.clip,
      seconds: g.guardTicks / 60,
    });
  }

  // -------------------------------------------------------------------------------------------- running actions

  _attackTick(dt, intent) {
    const m = this.move;
    this.t++;
    if (this.t > 2) {
      if (m.next && this.input.pressed('strike')) {
        this.input.consume('strike');
        this._queued = m.next;
      } else if (m.heavyNext && this.input.pressed('heavy')) {
        this.input.consume('heavy');
        this._queued = m.heavyNext;
      }
    }
    if (this.t <= m.startup) this._face(intent, this.data.lockOn.turnDeg * DEG * dt);
    if (this.t <= m.lungeTicks) this._lunge(m.lunge * dt);
    if (this.t > m.startup && this.t <= m.startup + m.active) this._swing(m, m.shape.radius, m.shape);
    if (this._queued && m.comboFrom && this.t >= m.comboFrom) {
      this._startMove(this._queued, intent, false);
      return;
    }
    if (this.t >= m.startup + m.active + m.recovery) this._end();
  }

  _finisherTick() {
    const f = this.move;
    this.t++;
    if (this.t > f.startup && this.t <= f.startup + f.active) {
      const feet = this._currentFeet();
      this._centre.x = feet.x;
      this._centre.y = feet.y + 1;
      this._centre.z = feet.z;
      const hits = this.director.hitEnemies(this._centre, f.radius, f, this._hitIds, feet);
      if (hits && this.t === f.startup + 1) {
        this.time.hitStop(f.hitStop);
        this.trauma = Math.max(this.trauma, f.shake);
      }
    }
    if (this.t >= f.startup + f.active + f.recovery) this._end();
  }

  _dodgeTick() {
    const l = this.data.langkah;
    this.t++;
    const u = Math.min(1, this.t / l.ticks);
    const eased = 1 - (1 - u) ** 2.4;
    const step = (eased - this._dodge.last) * l.distance;
    this._dodge.last = eased;
    this._moveSafely(this._dodge.dirX * step, this._dodge.dirZ * step);
    if (this.target) this._face(null, Math.PI);
    if (this.t >= l.ticks) {
      this._dodgeCooldown = l.cooldown;
      this._end();
    }
  }

  _guardTick() {
    const g = this.data.tangkis;
    this.t++;
    if (this.target) this._face(null, Math.PI);
    if (this._recovering > 0) {
      if (--this._recovering === 0) this._end();
      return;
    }
    if (this.t >= g.guardTicks && !this.input.held('tangkis')) this._recovering = g.recovery;
  }

  _hitTick(dt) {
    this.t++;
    const k = this._knock;
    this._moveSafely(k.x * dt, k.z * dt);
    const decay = Math.exp(-10 * dt);
    k.x *= decay;
    k.z *= decay;
    if (this.t >= this.data.health.hitStunTicks) this._end();
  }

  /**
   * Tests the move's attack sphere against the enemies and applies the feel on contact.
   * @param {object} m move data
   * @param {number} radius
   * @param {{ forward: number, height: number }} shape
   */
  _swing(m, radius, shape) {
    const feet = this._currentFeet();
    attackCentre(feet, this.traversal.facing, shape, this._centre);
    const hits = this.director.hitEnemies(this._centre, radius, m, this._hitIds, feet);
    if (!hits) return;
    this.time.hitStop(m.hitStop);
    this.trauma = Math.max(this.trauma, m.shake);
    this._addSemangat(this.data.semangat.perHit * hits);
  }

  // -------------------------------------------------------------------------------------------- movement helpers

  /** Turns toward the lock target (in magnet range) or the stick, by at most `maxStep` radians. */
  _face(intent, maxStep) {
    const tv = this.traversal;
    let yaw = null;
    const feet = this._currentFeet();
    if (this.target) {
      const p = this.target.position;
      const d = Math.hypot(p.x - feet.x, p.z - feet.z);
      if (d <= this.data.lockOn.magnetRange || this.hardLock) yaw = Math.atan2(p.x - feet.x, p.z - feet.z);
    }
    if (yaw === null && intent && intent.magnitude > 0.2) yaw = Math.atan2(intent.x, intent.z);
    if (yaw !== null) tv.facing = approachAngle(tv.facing, yaw, maxStep);
  }

  /** Lunges along the facing, stopping short of the target. */
  _lunge(distance) {
    let d = distance;
    if (this.target) {
      const feet = this._currentFeet();
      const p = this.target.position;
      const gap = Math.hypot(p.x - feet.x, p.z - feet.z) - (this.cc.radius + this.target.radius + 0.1);
      d = Math.max(0, Math.min(d, gap));
    }
    const facing = this.traversal.facing;
    this._moveSafely(Math.sin(facing) * d, Math.cos(facing) * d);
  }

  /** Moves on the ground, refusing steps that would leave it (no dodging off the jetty). */
  _moveSafely(dx, dz) {
    const feet = this._currentFeet();
    const probe = this.traversal.probe;
    if (probe && (dx || dz)) {
      const len = Math.hypot(dx, dz);
      const ahead = this.cc.radius * 0.8 + len;
      const ground = probe.groundAt(
        feet.x + (dx / len) * ahead,
        feet.y + 0.4,
        feet.z + (dz / len) * ahead,
        1.0,
      );
      if (Number.isNaN(ground) || feet.y - ground > 0.45) return;
    }
    this.cc.move(dx, 0, dz);
  }

  _push(from, distance) {
    const feet = this._currentFeet();
    const dx = feet.x - from.x;
    const dz = feet.z - from.z;
    const len = Math.hypot(dx, dz) || 1;
    this._moveSafely((dx / len) * distance * 0.25, (dz / len) * distance * 0.25);
  }

  _damage(amount, from, stun) {
    const h = this.data.health;
    this.health = Math.max(0, this.health - amount);
    this._sinceCombat = 0;
    this._invulnerable = h.invulnerableTicks;
    this.bus.emit(EV.PLAYER_HIT, { damage: amount, health: this.health });
    this.bus.emit(EV.PLAYER_HEALTH, { health: this.health, max: h.max });
    this.trauma = Math.max(this.trauma, 0.3);
    if (this.health <= 0) {
      this.bus.emit(EV.PLAYER_DEFEATED, {});
      return;
    }
    if (!stun || (this.traversal.state !== 'ground' && this.traversal.state !== 'combat')) return;
    const feet = this._currentFeet();
    const dx = feet.x - from.x;
    const dz = feet.z - from.z;
    const len = Math.hypot(dx, dz) || 1;
    this._knock.x = (dx / len) * h.knockback * 4;
    this._knock.z = (dz / len) * h.knockback * 4;
    this._begin('hit');
    this.bus.emit(EV.COMBAT_ACTION, {
      action: 'hit',
      move: 'hit',
      clip: 'hit_chest',
      seconds: h.hitStunTicks / 60,
    });
  }

  // -------------------------------------------------------------------------------------------- lock-on, meters

  _updateLock(intent) {
    const lock = this.data.lockOn;
    const feet = this._currentFeet();
    const previous = this.target;
    if (this.input.pressed('lockon')) {
      this.input.consume('lockon');
      if (this.hardLock) {
        this.hardLock = false;
        this.target = null;
      } else {
        const pick = this.director.pick(feet, this.traversal.facing, lock.range, Math.PI);
        if (pick) {
          this.target = pick;
          this.hardLock = true;
        }
      }
    }
    const t = this.target;
    if (t && (t.state === 'defeated' || !this.director.enemies.includes(t))) {
      this.target = null;
      this.hardLock = false;
    } else if (t && Math.hypot(t.position.x - feet.x, t.position.z - feet.z) > lock.range * 1.3) {
      this.target = null;
      this.hardLock = false;
    }
    if (!this.hardLock) {
      // Soft lock: the threat nearest the stick (or facing); touch assist: the nearest threat anywhere.
      const auto = this._autoLock();
      const yaw = intent.magnitude > 0.2 ? Math.atan2(intent.x, intent.z) : this.traversal.facing;
      this.target = this.director.pick(feet, yaw, lock.range, auto ? Math.PI : lock.softAngleDeg * DEG);
    }
    if (this.target !== previous) this.bus.emit(EV.LOCK_CHANGED, { id: this.target?.id ?? null });
  }

  _autoLock() {
    const setting = this.settings?.get('assists.autoLockOn');
    if (setting === 'auto') return this.input.device === 'touch';
    return setting === true;
  }

  _regen(dt) {
    const h = this.data.health;
    if (this.state !== 'idle' || this.inCombat) {
      this._sinceCombat = 0;
      return;
    }
    this._sinceCombat += dt;
    if (this._sinceCombat < h.regenDelay || this.health >= h.max) return;
    this.health = Math.min(h.max, this.health + h.regenRate * dt);
    this.bus.emit(EV.PLAYER_HEALTH, { health: this.health, max: h.max });
  }

  _addSemangat(amount) {
    const max = this.data.semangat.max;
    const value = Math.min(max, this.semangat + amount);
    if (value === this.semangat) return;
    this.semangat = value;
    this.bus.emit(EV.SEMANGAT_CHANGED, { value, max });
  }

  _perfectTicks() {
    const d = this.data;
    const difficulty = this.settings?.get('assists.difficulty') ?? 'normal';
    let seconds = d.perfectSeconds[difficulty] ?? d.perfectSeconds.normal;
    if (this.input.device === 'touch') seconds += d.touchBonusSeconds;
    const wider = this.settings?.get('assists.widerParry');
    if (wider === true || (wider === 'auto' && this.input.device === 'touch'))
      seconds += d.widerParryBonusSeconds;
    return Math.round(seconds * 60);
  }

  _facingDot(p) {
    const feet = this._currentFeet();
    const dx = p.x - feet.x;
    const dz = p.z - feet.z;
    const len = Math.hypot(dx, dz) || 1;
    const f = this.traversal.facing;
    return (dx * Math.sin(f) + dz * Math.cos(f)) / len;
  }

  _currentFeet() {
    this._feet.x = this.cc.position.x;
    this._feet.y = this.cc.feetY;
    this._feet.z = this.cc.position.z;
    return this._feet;
  }
}
