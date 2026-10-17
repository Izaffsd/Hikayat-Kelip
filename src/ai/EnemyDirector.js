import { sphereHitsCapsule, inFront } from '../combat/hit.js';
import { EV } from '../core/events.js';
import { Enemy } from './Enemy.js';

const STRIKE_HALF_ANGLE = (65 * Math.PI) / 180;

/**
 * Runs encounters (TECHNICAL §6.3, §8): spawns the enemies of an encounter on its arena, hands out attack tokens
 * (only N enemies wind up or strike at once, so fights stay readable on a phone), resolves each enemy strike once
 * against the player through the combat system (which decides perfect tangkis, block, perfect langkah, dodge or
 * hit), lets the player's swings hit enemies, keeps enemies apart and off the player, and reports when the
 * encounter is cleared. Plain data and maths: it runs headless in the unit tests.
 */
export class EnemyDirector {
  /**
   * @param {object} options
   * @param {import('../core/EventBus.js').EventBus} options.bus
   * @param {object} options.archetypes data/combat/enemies.json
   * @param {number} [options.tokens=2] attack tokens (by difficulty)
   * @param {number} [options.seed=1]
   */
  constructor({ bus, archetypes, tokens = 2, seed = 1 }) {
    this.bus = bus;
    this.archetypes = archetypes;
    this.tokens = tokens;
    /** @type {Enemy[]} */
    this.enemies = [];
    /** @type {object|null} */
    this.encounter = null;
    this._seed = seed >>> 0;
    this._nextId = 1;
    this._cleared = false;
    /** @type {Map<number, string>} */
    this._lastState = new Map();
  }

  /** Deterministic random in [0, 1) (mulberry32). */
  rng = () => {
    this._seed = (this._seed + 0x6d2b79f5) >>> 0;
    let t = this._seed;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };

  /**
   * Starts an encounter.
   * @param {{ id: string, arena: { cx: number, cz: number, hx: number, hz: number, y: number },
   *   spawns: Array<{ archetype: string, x: number, z: number }> }} encounter
   */
  start(encounter) {
    this.stop();
    this.encounter = encounter;
    this._cleared = false;
    for (const spawn of encounter.spawns) this.spawn(spawn.archetype, spawn.x, spawn.z);
    this.bus.emit(EV.ENCOUNTER_STARTED, { id: encounter.id });
  }

  /**
   * Adds one enemy to the running encounter.
   * @param {string} archetype
   * @param {number} x
   * @param {number} z
   * @returns {Enemy}
   */
  spawn(archetype, x, z) {
    const def = this.archetypes[archetype];
    if (!def) throw new Error(`EnemyDirector: unknown archetype "${archetype}"`);
    const enemy = new Enemy({
      id: this._nextId++,
      archetype,
      def,
      x,
      z,
      arena: this.encounter.arena,
      rng: this.rng,
    });
    this.enemies.push(enemy);
    this.bus.emit(EV.ENEMY_SPAWNED, { id: enemy.id, archetype });
    return enemy;
  }

  /** Ends the encounter and removes every enemy. */
  stop() {
    for (const enemy of this.enemies) this.bus.emit(EV.ENEMY_REMOVED, { id: enemy.id });
    this.enemies.length = 0;
    this._lastState.clear();
    this.encounter = null;
  }

  /**
   * @param {Enemy} enemy
   * @returns {boolean} whether it may wind up an attack now
   */
  requestToken(enemy) {
    if (enemy.hasToken) return true;
    if (enemy.kind !== 'boss') {
      let holders = 0;
      for (const other of this.enemies) if (other.hasToken) holders++;
      if (holders >= this.tokens) return false;
    }
    enemy.hasToken = true;
    return true;
  }

  /**
   * @param {Enemy} enemy
   */
  releaseToken(enemy) {
    enemy.hasToken = false;
  }

  /**
   * One fixed tick: think, strike, separate, clean up.
   * @param {number} dt
   * @param {{ feet: { x: number, y: number, z: number }, radius: number,
   *   dodgeOrigin?: { x: number, z: number }|null,
   *   receiveStrike(enemy: Enemy): 'perfectParry'|'block'|'perfectDodge'|'dodge'|'hit'|null }} player
   */
  fixedUpdate(dt, player) {
    if (!this.encounter) return;
    const feet = player.feet;
    for (const enemy of this.enemies) {
      const contact = enemy.radius + player.radius + 0.05;
      enemy.update(dt, feet, this, contact);
      this._announce(enemy);
      if (enemy.striking) this._resolveStrike(enemy, player);
    }
    this._separate(feet, player.radius);
    for (let i = this.enemies.length - 1; i >= 0; i--) {
      const enemy = this.enemies[i];
      if (enemy.alive) continue;
      this.enemies.splice(i, 1);
      this._lastState.delete(enemy.id);
      this.bus.emit(EV.ENEMY_REMOVED, { id: enemy.id });
    }
    if (!this._cleared && this.enemies.every((e) => e.state === 'defeated')) {
      this._cleared = true;
      this.bus.emit(EV.ENCOUNTER_CLEARED, { id: this.encounter.id });
    }
  }

  /**
   * The player's swing: an attack sphere against every hittable enemy not yet hit by this swing.
   * @param {{ x: number, y: number, z: number }} centre
   * @param {number} radius
   * @param {{ damage: number, poise: number, knockback: number, guardBreak?: boolean }} move
   * @param {Set<number>} already ids hit earlier in this swing (updated)
   * @param {{ x: number, z: number }} from attacker position (knockback direction)
   * @returns {number} enemies hit
   */
  hitEnemies(centre, radius, move, already, from) {
    let hits = 0;
    for (const enemy of this.enemies) {
      if (!enemy.hittable || already.has(enemy.id)) continue;
      const p = enemy.position;
      if (
        !sphereHitsCapsule(
          centre.x,
          centre.y,
          centre.z,
          radius,
          p.x,
          p.y - enemy.hover,
          p.z,
          enemy.radius,
          enemy.height + enemy.hover,
        )
      ) {
        continue;
      }
      already.add(enemy.id);
      const dx = p.x - from.x;
      const dz = p.z - from.z;
      const len = Math.hypot(dx, dz) || 1;
      const result = enemy.takeHit(
        {
          damage: move.damage,
          poise: move.poise,
          knockback: move.knockback,
          dirX: dx / len,
          dirZ: dz / len,
          guardBreak: move.guardBreak,
        },
        this,
      );
      if (!result) continue;
      hits++;
      this.bus.emit(EV.ENEMY_HIT, {
        id: enemy.id,
        damage: move.damage,
        vitality: enemy.vitality,
        max: enemy.vitalityMax,
      });
      if (result === 'stagger') this.bus.emit(EV.ENEMY_STAGGERED, { id: enemy.id, reason: 'poise' });
      if (result === 'defeated')
        this.bus.emit(EV.ENEMY_DEFEATED, { id: enemy.id, archetype: enemy.archetype, kind: enemy.kind });
      if (enemy.phaseChanged) {
        enemy.phaseChanged = false;
        this.bus.emit(EV.ENEMY_PHASE, { id: enemy.id, phase: enemy.phaseIndex });
      }
    }
    return hits;
  }

  /**
   * Enemies still fighting within a range (combat or not, lock-on).
   * @param {{ x: number, z: number }} feet
   * @param {number} range
   * @returns {number}
   */
  threats(feet, range) {
    let n = 0;
    for (const enemy of this.enemies) {
      if (enemy.state === 'defeated') continue;
      if (Math.hypot(enemy.position.x - feet.x, enemy.position.z - feet.z) <= range) n++;
    }
    return n;
  }

  /**
   * The threat that best matches a direction (lock-on): nearest within range, inside the cone, by angle then distance.
   * @param {{ x: number, z: number }} feet
   * @param {number} yaw preferred direction
   * @param {number} range
   * @param {number} halfAngle radians
   * @returns {Enemy|null}
   */
  pick(feet, yaw, range, halfAngle) {
    let best = null;
    let bestScore = Infinity;
    for (const enemy of this.enemies) {
      if (enemy.state === 'defeated' || enemy.state === 'spawn') continue;
      const dx = enemy.position.x - feet.x;
      const dz = enemy.position.z - feet.z;
      const dist = Math.hypot(dx, dz);
      if (dist > range) continue;
      const cos = dist > 1e-4 ? (dx * Math.sin(yaw) + dz * Math.cos(yaw)) / dist : 1;
      if (cos < Math.cos(halfAngle)) continue;
      const score = (1 - cos) * 6 + dist;
      if (score < bestScore) {
        bestScore = score;
        best = enemy;
      }
    }
    return best;
  }

  _resolveStrike(enemy, player) {
    // A step that started inside the swing still counts against it (that is what makes it a perfect langkah).
    const feet = player.dodgeOrigin ?? player.feet;
    const p = enemy.position;
    const { reach } = enemy.strike;
    const dist = Math.hypot(feet.x - p.x, feet.z - p.z);
    const dash = enemy.state === 'dash';
    if (dist > reach + player.radius) return;
    if (!dash && !inFront(p.x, p.z, enemy.facing, feet.x, feet.z, STRIKE_HALF_ANGLE)) return;
    enemy.attackResolved = true;
    const outcome = player.receiveStrike(enemy);
    if (outcome === 'perfectParry') {
      enemy.stagger(enemy.def.staggerSeconds ?? 1.2, this);
      this.bus.emit(EV.ENEMY_STAGGERED, { id: enemy.id, reason: 'parry' });
    }
  }

  _announce(enemy) {
    const last = this._lastState.get(enemy.id);
    if (last === enemy.state) return;
    this._lastState.set(enemy.id, enemy.state);
    if (enemy.state === 'windup' || enemy.state === 'dashWindup') {
      const seconds = enemy.state === 'dashWindup' ? enemy._phase().dash.windup : enemy.attackDef.windup;
      this.bus.emit(EV.ENEMY_TELEGRAPH, {
        id: enemy.id,
        kind: enemy.state === 'dashWindup' ? 'dash' : 'strike',
        seconds,
      });
    }
  }

  _separate(feet, playerRadius) {
    const list = this.enemies;
    for (let i = 0; i < list.length; i++) {
      const a = list[i];
      if (a.state === 'defeated') continue;
      // Off the player (the player pushes enemies; enemies never block the player's capsule).
      if (a.kind !== 'wisp') {
        const dx = a.position.x - feet.x;
        const dz = a.position.z - feet.z;
        const d = Math.hypot(dx, dz);
        const min = a.radius + playerRadius + 0.05;
        if (d < min) a._step(((dx || 1e-3) / (d || 1)) * (min - d), ((dz || 0) / (d || 1)) * (min - d));
      }
      for (let j = i + 1; j < list.length; j++) {
        const b = list[j];
        if (b.state === 'defeated') continue;
        const dx = b.position.x - a.position.x;
        const dz = b.position.z - a.position.z;
        const d = Math.hypot(dx, dz);
        const min = a.radius + b.radius + 0.25;
        if (d >= min || d < 1e-5) continue;
        const push = (min - d) / 2;
        a._step((-dx / d) * push, (-dz / d) * push);
        b._step((dx / d) * push, (dz / d) * push);
      }
    }
  }
}
