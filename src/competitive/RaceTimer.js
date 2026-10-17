import { EV } from '../core/events.js';

/**
 * A race clock on game time (fixed ticks, so hit-stop and slow motion count as the game does): started by a mission
 * (Adi's dare in 1.1, GDD: "a visible timer and Adi as a rival runner quietly teach the competitive loop"), stopped
 * at the finish. The result says whether Bayu beat the rival and keeps the best time in the save. Trials with
 * ghosts and medals build on this in Phase 5.
 */
export class RaceTimer {
  /**
   * @param {object} options
   * @param {import('../core/EventBus.js').EventBus} options.bus
   * @param {{ missions: { best: Record<string, number> } }} options.doc save document
   */
  constructor({ bus, doc }) {
    this.bus = bus;
    this.doc = doc;
    /** @type {string|null} */
    this.id = null;
    this.seconds = 0;
    this.running = false;
  }

  /**
   * @param {string} id race id (the mission's)
   */
  start(id) {
    this.id = id;
    this.seconds = 0;
    this.running = true;
    this.bus.emit(EV.RACE_STARTED, { id });
  }

  /**
   * One fixed tick.
   * @param {number} dt
   */
  fixedUpdate(dt) {
    if (this.running) this.seconds += dt;
  }

  /**
   * Stops the clock and records the result.
   * @param {boolean} won whether Bayu finished ahead of the rival
   * @returns {{ id: string, seconds: number, won: boolean, best: number, record: boolean }|null}
   */
  finish(won) {
    if (!this.running) return null;
    this.running = false;
    const id = this.id;
    const seconds = Math.round(this.seconds * 100) / 100;
    const previous = this.doc.missions.best[id];
    const record = !Number.isFinite(previous) || seconds < previous;
    if (record) this.doc.missions.best[id] = seconds;
    const result = { id, seconds, won, best: this.doc.missions.best[id], record };
    this.bus.emit(EV.RACE_FINISHED, result);
    return result;
  }

  /** Abandons a race without a result (mission restart, region change). */
  cancel() {
    if (!this.running) return;
    this.running = false;
    this.bus.emit(EV.RACE_FINISHED, {
      id: this.id,
      seconds: this.seconds,
      won: false,
      best: null,
      cancelled: true,
    });
  }
}

/**
 * Formats seconds as m:ss.cc.
 * @param {number} seconds
 * @returns {string}
 */
export function formatRaceTime(seconds) {
  const s = Math.max(0, seconds);
  const minutes = Math.floor(s / 60);
  const rest = s - minutes * 60;
  return `${minutes}:${rest.toFixed(2).padStart(5, '0')}`;
}
