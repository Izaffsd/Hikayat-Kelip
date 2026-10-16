/**
 * Fixed-timestep loop with interpolated rendering.
 *
 * Each rendered frame: `onFrameStart(dt)` (poll input) → `onFixed(fixedDt)` × n → `onFrame(dt)`.
 * The accumulator receives real time × `time.scale`, so slow motion simply produces fewer ticks
 * per second while rendering stays smooth. `step(nowMs)` is the whole algorithm and is unit-tested.
 */
export class Loop {
  /**
   * @param {object} options
   * @param {import('./Time.js').Time} options.time
   * @param {(dt: number) => void} [options.onFrameStart]
   * @param {(fixedDt: number) => void} options.onFixed
   * @param {(dt: number) => void} options.onFrame
   * @param {number} [options.maxSteps=5] spiral-of-death guard
   * @param {number} [options.maxFrameDt=0.25] clamp for long frames (tab switches, breakpoints)
   */
  constructor({ time, onFrameStart = () => {}, onFixed, onFrame, maxSteps = 5, maxFrameDt = 0.25 }) {
    this.time = time;
    this.onFrameStart = onFrameStart;
    this.onFixed = onFixed;
    this.onFrame = onFrame;
    this.maxSteps = maxSteps;
    this.maxFrameDt = maxFrameDt;
    /** Fixed steps run in the last frame. */
    this.lastSteps = 0;
    /** Frames where the step cap dropped simulation time. */
    this.droppedFrames = 0;
    this._accumulator = 0;
    this._lastMs = -1;
    this._capIntervalMs = 0;
    this._running = false;
    this._driver = null;
  }

  /**
   * Caps rendering to a frame rate (0 = uncapped). Simulation stays at the fixed rate.
   * @param {number} fps
   */
  setFpsCap(fps) {
    this._capIntervalMs = fps > 0 ? 1000 / fps : 0;
  }

  /**
   * Starts the loop on a driver such as `renderer.setAnimationLoop`.
   * @param {(callback: ((nowMs: number) => void) | null) => void} setAnimationLoop
   */
  start(setAnimationLoop) {
    if (this._running) return;
    this._running = true;
    this._driver = setAnimationLoop;
    this._lastMs = -1;
    setAnimationLoop((nowMs) => this.step(nowMs));
  }

  /** Stops the loop (e.g. when the page is hidden). */
  stop() {
    if (!this._running) return;
    this._running = false;
    this._driver?.(null);
  }

  /** Whether the loop is running. */
  get running() {
    return this._running;
  }

  /** Forgets the last timestamp so the next frame does not see the paused gap. */
  resetClock() {
    this._lastMs = -1;
  }

  /**
   * Advances one rendered frame. Returns false when the frame was skipped by the FPS cap.
   * @param {number} nowMs high-resolution timestamp in milliseconds
   * @returns {boolean}
   */
  step(nowMs) {
    if (this._lastMs < 0) this._lastMs = nowMs;
    const elapsedMs = nowMs - this._lastMs;
    // Allow 1.5 ms of jitter so a 60 Hz display reliably renders every other vsync at a 30 FPS cap.
    if (this._capIntervalMs > 0 && elapsedMs > 0 && elapsedMs < this._capIntervalMs - 1.5) return false;

    let dt = elapsedMs / 1000;
    this._lastMs = nowMs;
    if (dt < 0) dt = 0;
    if (dt > this.maxFrameDt) dt = this.maxFrameDt;

    const time = this.time;
    time.realTime += dt;
    time.frameDelta = dt;
    time.frame++;

    this.onFrameStart(dt);

    if (time.hitStopRemaining > 0) {
      time.hitStopRemaining = Math.max(0, time.hitStopRemaining - dt);
    } else {
      this._accumulator += dt * time.scale;
    }

    let steps = 0;
    while (this._accumulator >= time.fixedDt) {
      if (steps >= this.maxSteps) {
        this._accumulator = 0;
        this.droppedFrames++;
        break;
      }
      this.onFixed(time.fixedDt);
      time.tick++;
      time.gameTime += time.fixedDt;
      this._accumulator -= time.fixedDt;
      steps++;
    }
    this.lastSteps = steps;
    time.alpha = this._accumulator / time.fixedDt;

    this.onFrame(dt);
    return true;
  }
}
