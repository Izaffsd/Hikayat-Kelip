import { EV } from '../core/events.js';

/**
 * Kelip's call (GDD "Kelip guidance", TECHNICAL §9): there is no minimap or waypoint arrow. Calling Kelip (the
 * firefly button) sends the world's fireflies flashing in a wave toward the current objective, plus a short stream
 * of guide motes from Bayu along the way so it reads anywhere. If Bayu wanders without getting closer for a while,
 * Kelip calls by itself. In a fight with a full Semangat meter the same button is the finisher (CombatSystem takes
 * the press first).
 */
export class KelipGuide {
  /**
   * @param {object} options
   * @param {import('../core/EventBus.js').EventBus} options.bus
   * @param {import('../core/Input.js').Input} options.input
   * @param {{ guideTarget: { x: number, y: number, z: number }|null }} options.missions
   * @param {() => { x: number, y: number, z: number }} options.feet
   * @param {(origin: object, target: object) => void} options.wave starts the visual wave
   * @param {object} options.tuning { cooldown, lostSeconds, lostProgress }
   */
  constructor({ bus, input, missions, feet, wave, tuning }) {
    Object.assign(this, { bus, input, missions, feet, wave, tuning });
    this._cooldown = 0;
    this._lost = 0;
    this._best = Infinity;
    this._lastTarget = null;
  }

  /**
   * @param {number} dt
   */
  fixedUpdate(dt) {
    this._cooldown = Math.max(0, this._cooldown - dt);
    if (this.input.pressed('kelip')) {
      this.input.consume('kelip');
      this.call();
      return;
    }
    // Lost: no progress toward the goal for a while → Kelip calls on its own.
    const target = this.missions.guideTarget;
    if (!target) {
      this._lost = 0;
      return;
    }
    if (!this._lastTarget || this._lastTarget.x !== target.x || this._lastTarget.z !== target.z) {
      this._lastTarget = { ...target };
      this._best = Infinity;
      this._lost = 0;
    }
    const feet = this.feet();
    const d = Math.hypot(target.x - feet.x, target.z - feet.z);
    if (d < this._best - this.tuning.lostProgress) {
      this._best = d;
      this._lost = 0;
    } else {
      this._lost += dt;
    }
    if (this._lost >= this.tuning.lostSeconds && d > 6) {
      this._lost = 0;
      this.call();
    }
  }

  /** Calls Kelip now (button, idle-lost, or a mission's `kelipWave`). */
  call(target = this.missions.guideTarget) {
    if (this._cooldown > 0) return;
    this._cooldown = this.tuning.cooldown;
    const feet = this.feet();
    if (target) this.wave({ x: feet.x, y: feet.y, z: feet.z }, target);
    this.bus.emit(EV.KELIP_CALLED, { target: target ?? null });
  }
}
