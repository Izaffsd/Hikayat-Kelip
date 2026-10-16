/**
 * Game clock. Gameplay advances in fixed ticks; rendering interpolates between ticks with `alpha`.
 * Time scale is the product of named sources (e.g. the game-speed assist and slow motion), so
 * systems can change their own factor without overwriting each other.
 */
export class Time {
  /**
   * @param {number} [fixedHz=60] simulation rate
   */
  constructor(fixedHz = 60) {
    /** Seconds per fixed tick. */
    this.fixedDt = 1 / fixedHz;
    /** Fixed ticks simulated since start. */
    this.tick = 0;
    /** Simulated game seconds (scaled). */
    this.gameTime = 0;
    /** Real seconds since start (unscaled, excludes hidden time). */
    this.realTime = 0;
    /** Rendered frames since start. */
    this.frame = 0;
    /** Real seconds between the last two rendered frames. */
    this.frameDelta = 0;
    /** Interpolation factor between the previous and current tick, 0..1. */
    this.alpha = 0;
    /** Remaining real seconds of hit-stop. */
    this.hitStopRemaining = 0;
    /** @type {Map<string, number>} */
    this._scales = new Map();
    this._scale = 1;
  }

  /** Effective gameplay time scale. */
  get scale() {
    return this._scale;
  }

  /**
   * Sets one named factor of the time scale (1 removes its effect).
   * @param {string} source
   * @param {number} factor
   */
  setScale(source, factor) {
    if (factor === 1) this._scales.delete(source);
    else this._scales.set(source, Math.max(0, factor));
    let scale = 1;
    for (const value of this._scales.values()) scale *= value;
    this._scale = scale;
  }

  /**
   * Freezes gameplay for a short real-time duration (impact feel). Overlapping calls keep the longest.
   * @param {number} seconds
   */
  hitStop(seconds) {
    this.hitStopRemaining = Math.max(this.hitStopRemaining, seconds);
  }

  /**
   * Converts seconds to whole fixed ticks (rounded).
   * @param {number} seconds
   * @returns {number}
   */
  secondsToTicks(seconds) {
    return Math.round(seconds / this.fixedDt);
  }

  /**
   * Converts fixed ticks to seconds.
   * @param {number} ticks
   * @returns {number}
   */
  ticksToSeconds(ticks) {
    return ticks * this.fixedDt;
  }
}
