import { approachAngle, wrapAngle } from '../player/Traversal.js';

/**
 * One enemy in an encounter (TECHNICAL §6.3, §8; GDD Enemies). Enemies move on their encounter arena's floor (flat
 * decks; wisps hover above it), which keeps them readable and off the water. Every attack has a telegraphed wind-up
 * and needs an attack token from the director, so only a few threats attack at once.
 *
 * States: `spawn` → `approach` → `circle` ⇄ (`windup` → `attack` → `recover`), `dashWindup` → `dash` (Adi, phase 2),
 * `hit` (stun), `stagger` (after a perfect tangkis or broken poise: open to punishment), `defeated` (wisps dissolve
 * into fireflies; cursed villagers are freed — never killed).
 */
export class Enemy {
  /**
   * @param {object} options
   * @param {number} options.id
   * @param {string} options.archetype key in data/combat/enemies.json
   * @param {object} options.def archetype data
   * @param {number} options.x spawn position
   * @param {number} options.z
   * @param {{ cx: number, cz: number, hx: number, hz: number, y: number }} options.arena
   * @param {() => number} options.rng deterministic random in [0, 1)
   */
  constructor({ id, archetype, def, x, z, arena, rng }) {
    this.id = id;
    this.archetype = archetype;
    this.def = def;
    /** @type {'wisp'|'cursed'|'boss'} */
    this.kind = def.kind;
    this.arena = arena;
    this.rng = rng;
    this.radius = def.radius;
    this.height = def.height;
    this.hover = def.hover ?? 0;
    this.position = { x, y: arena.y + this.hover, z };
    this.prev = { x, y: arena.y + this.hover, z };
    this.facing = 0;
    this.prevFacing = 0;
    this.vitalityMax = def.health ?? def.corruption;
    this.vitality = this.vitalityMax;
    this.poise = def.poiseMax;
    /** @type {string} */
    this.state = 'spawn';
    this.stateTime = 0;
    this.phaseIndex = 0;
    this.attackDef = this._phase().attack ?? def.attack;
    this.cooldown = this._roll(this.attackDef.cooldown) * 0.5;
    this.dashCooldown = 2;
    this.circleDir = rng() < 0.5 ? -1 : 1;
    this.hasToken = false;
    /** Whether the current attack has been resolved against the player (one hit per swing). */
    this.attackResolved = true;
    this.flurryLeft = 0;
    this.dashLeft = 0;
    this.dashDirX = 0;
    this.dashDirZ = 0;
    this.knockX = 0;
    this.knockZ = 0;
    this._staggerTime = 0;
    /** Set when a boss crosses into its next phase (the director announces it, then clears it). */
    this.phaseChanged = false;
    /** False once a defeated enemy has finished dissolving / walking off. */
    this.alive = true;
  }

  /** Whether the player's attacks can hit it now. */
  get hittable() {
    return this.state !== 'spawn' && this.state !== 'defeated';
  }

  /** Whether it is in a damaging phase this tick (the director resolves it once). */
  get striking() {
    return (this.state === 'attack' || this.state === 'dash') && !this.attackResolved;
  }

  /** Damage and reach of the current strike. */
  get strike() {
    if (this.state === 'dash') return { damage: this._phase().dash.damage, reach: this.radius + 0.6 };
    return { damage: this.attackDef.damage, reach: this.attackDef.reach };
  }

  /**
   * One fixed tick.
   * @param {number} dt
   * @param {{ x: number, y: number, z: number }} player feet
   * @param {{ requestToken(enemy: Enemy): boolean, releaseToken(enemy: Enemy): void }} director
   * @param {number} contact minimum centre distance to the player (radii)
   */
  update(dt, player, director, contact) {
    this.prev.x = this.position.x;
    this.prev.y = this.position.y;
    this.prev.z = this.position.z;
    this.prevFacing = this.facing;
    this.stateTime += dt;
    const dx = player.x - this.position.x;
    const dz = player.z - this.position.z;
    const dist = Math.hypot(dx, dz) || 1e-4;
    const toPlayer = Math.atan2(dx, dz);
    const def = this.def;

    // Knockback slides it, fading quickly.
    this._step(this.knockX * dt, this.knockZ * dt);
    const decay = Math.exp(-9 * dt);
    this.knockX *= decay;
    this.knockZ *= decay;

    switch (this.state) {
      case 'spawn':
        if (this.stateTime >= 0.6) this._enter('approach');
        break;
      case 'approach': {
        this._turn(toPlayer, dt, 8);
        const step = Math.min(def.speed * dt, Math.max(0, dist - def.orbit));
        this._step((dx / dist) * step, (dz / dist) * step);
        if (dist <= def.orbit + 0.3) this._enter('circle');
        break;
      }
      case 'circle': {
        this._turn(toPlayer, dt, 6);
        // Hold the orbit distance, drift around the player, sometimes change direction.
        const radial = (dist - def.orbit) * 2;
        const tangential = def.speed * 0.45 * this.circleDir;
        const rx = dx / dist;
        const rz = dz / dist;
        this._step((rx * radial + -rz * tangential) * dt, (rz * radial + rx * tangential) * dt);
        if (this.rng() < dt * 0.4) this.circleDir = -this.circleDir;
        this.cooldown -= dt;
        this.dashCooldown -= dt;
        const dash = this._phase().dash;
        if (dash && this.dashCooldown <= 0 && dist > 3.5 && director.requestToken(this)) {
          this._enter('dashWindup');
        } else if (this.cooldown <= 0 && director.requestToken(this)) {
          this.flurryLeft = (this.attackDef.flurry ?? 1) - 1;
          this._enter('windup');
        }
        break;
      }
      case 'windup':
        this._turn(toPlayer, dt, 10);
        if (this.stateTime >= this.attackDef.windup) {
          this.attackResolved = false;
          this._enter('attack');
        }
        break;
      case 'attack': {
        // Lunge toward the player during the active window, never into them.
        const speed = this.attackDef.lunge;
        const step = Math.min(speed * dt, Math.max(0, dist - contact));
        this._step(Math.sin(this.facing) * step, Math.cos(this.facing) * step);
        if (this.stateTime >= this.attackDef.active) {
          this.attackResolved = true;
          this._enter('recover');
        }
        break;
      }
      case 'recover':
        if (this.flurryLeft > 0 && this.stateTime >= (this.attackDef.flurryGap ?? 0.3)) {
          // Follow-up swings come after a short gap, each with its full tell (GDD: every wind-up ≥ 0.35 s).
          this.flurryLeft--;
          this._enter('windup');
          break;
        }
        if (this.stateTime >= this.attackDef.recover) {
          director.releaseToken(this);
          this.cooldown = this._roll(this.attackDef.cooldown);
          this._enter('circle');
        }
        break;
      case 'dashWindup':
        this._turn(toPlayer, dt, 12);
        if (this.stateTime >= this._phase().dash.windup) {
          this.dashDirX = Math.sin(this.facing);
          this.dashDirZ = Math.cos(this.facing);
          this.dashLeft = this._phase().dash.distance;
          this.attackResolved = false;
          this._enter('dash');
        }
        break;
      case 'dash': {
        const dash = this._phase().dash;
        const step = Math.min(dash.speed * dt, this.dashLeft);
        const moved = this._step(this.dashDirX * step, this.dashDirZ * step);
        this.dashLeft -= step;
        if (this.dashLeft <= 1e-3 || moved < step * 0.5) {
          this.attackResolved = true;
          this.dashCooldown = this._roll(dash.cooldown);
          this._enter('recover');
          this.stateTime = -0.2; // a longer opening after the big lunge
        }
        break;
      }
      case 'hit':
        if (this.stateTime >= def.hitStunSeconds) this._enter('circle');
        break;
      case 'stagger':
        if (this.stateTime >= this._staggerTime) {
          this.poise = def.poiseMax;
          this._enter('circle');
        }
        break;
      case 'defeated':
        if (this.stateTime >= (this.kind === 'wisp' ? def.dissolveSeconds : def.freeSeconds))
          this.alive = false;
        break;
      default:
        break;
    }
  }

  /**
   * The player's attack connects.
   * @param {{ damage: number, poise: number, knockback: number, dirX: number, dirZ: number, guardBreak?: boolean }} hit
   * @param {{ releaseToken(enemy: Enemy): void }} director
   * @returns {'hit'|'stagger'|'defeated'|null}
   */
  takeHit(hit, director) {
    if (!this.hittable) return null;
    this.vitality = Math.max(0, this.vitality - hit.damage);
    this.knockX = hit.dirX * hit.knockback * 3;
    this.knockZ = hit.dirZ * hit.knockback * 3;
    if (this.vitality <= 0) {
      this.defeat(director);
      return 'defeated';
    }
    this._checkPhase();
    if (this.def.poiseMax > 0) {
      this.poise -= hit.poise;
      if (this.poise <= 0 || hit.guardBreak) {
        this.stagger(this.def.staggerSeconds, director);
        return 'stagger';
      }
    }
    // Cursed fighters keep their heavy swing through light hits (poise); wisps and idle enemies flinch.
    const committed =
      this.state === 'windup' ||
      this.state === 'attack' ||
      this.state === 'dashWindup' ||
      this.state === 'dash';
    if (this.def.poiseMax === 0 || !committed) {
      director.releaseToken(this);
      this.attackResolved = true;
      this._enter('hit');
    }
    return 'hit';
  }

  /**
   * Knocked off balance (perfect tangkis, broken poise): open for punishment.
   * @param {number} seconds
   * @param {{ releaseToken(enemy: Enemy): void }} director
   */
  stagger(seconds, director) {
    director.releaseToken(this);
    this.attackResolved = true;
    this.flurryLeft = 0;
    this._staggerTime = seconds;
    this._enter('stagger');
  }

  /**
   * @param {{ releaseToken(enemy: Enemy): void }} director
   */
  defeat(director) {
    director.releaseToken(this);
    this.attackResolved = true;
    this._enter('defeated');
  }

  /** Current boss phase (or the archetype itself). */
  _phase() {
    return this.def.phases?.[this.phaseIndex] ?? this.def;
  }

  _checkPhase() {
    const phases = this.def.phases;
    if (!phases) return;
    while (
      this.phaseIndex < phases.length - 1 &&
      this.vitality / this.vitalityMax < phases[this.phaseIndex].until
    ) {
      this.phaseIndex++;
      this.attackDef = phases[this.phaseIndex].attack;
      this.phaseChanged = true;
    }
  }

  _enter(state) {
    this.state = state;
    this.stateTime = 0;
  }

  _turn(target, dt, rate) {
    this.facing = approachAngle(this.facing, target, rate * dt);
  }

  _roll([min, max]) {
    return min + (max - min) * this.rng();
  }

  /** Moves on the arena floor, clamped inside it; returns the distance actually moved. */
  _step(dx, dz) {
    const a = this.arena;
    const m = this.radius;
    const x = Math.min(a.cx + a.hx - m, Math.max(a.cx - a.hx + m, this.position.x + dx));
    const z = Math.min(a.cz + a.hz - m, Math.max(a.cz - a.hz + m, this.position.z + dz));
    const moved = Math.hypot(x - this.position.x, z - this.position.z);
    this.position.x = x;
    this.position.z = z;
    return moved;
  }

  /**
   * Facing interpolated for rendering.
   * @param {number} alpha
   * @returns {number}
   */
  interpolatedFacing(alpha) {
    return this.prevFacing + wrapAngle(this.facing - this.prevFacing) * alpha;
  }
}
