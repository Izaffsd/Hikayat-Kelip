/**
 * Rolling frame-time statistics for the debug overlay, dynamic resolution and telemetry.
 * Stores the last N frame times in a typed ring buffer (no per-frame allocation).
 */
export class PerfMonitor {
  /**
   * @param {number} [capacity=600] frames kept (~10 s at 60 FPS)
   */
  constructor(capacity = 600) {
    this.samples = new Float32Array(capacity);
    this.count = 0;
    this.index = 0;
    this._sorted = new Float32Array(capacity);
    /** Totals for long-window averages (telemetry). */
    this.windowFrames = 0;
    this.windowSeconds = 0;
  }

  /**
   * Records one frame's duration.
   * @param {number} seconds
   */
  record(seconds) {
    this.samples[this.index] = seconds;
    this.index = (this.index + 1) % this.samples.length;
    if (this.count < this.samples.length) this.count++;
    this.windowFrames++;
    this.windowSeconds += seconds;
  }

  /**
   * Average frame time over the most recent `frames` samples (seconds).
   * @param {number} [frames]
   * @returns {number}
   */
  averageFrameTime(frames = this.count) {
    const n = Math.min(frames, this.count);
    if (n === 0) return 0;
    let sum = 0;
    for (let i = 1; i <= n; i++)
      sum += this.samples[(this.index - i + this.samples.length) % this.samples.length];
    return sum / n;
  }

  /**
   * Largest frame time over the most recent `frames` samples (seconds).
   * @param {number} [frames]
   * @returns {number}
   */
  maxFrameTime(frames = this.count) {
    const n = Math.min(frames, this.count);
    let max = 0;
    for (let i = 1; i <= n; i++) {
      const v = this.samples[(this.index - i + this.samples.length) % this.samples.length];
      if (v > max) max = v;
    }
    return max;
  }

  /**
   * Median frame time over the most recent `frames` samples (seconds).
   * @param {number} frames
   * @returns {number}
   */
  medianFrameTime(frames) {
    return this.percentileFrameTime(frames, 0.5);
  }

  /**
   * Frame time at a percentile (0..1) of the most recent `frames` samples, e.g. 0.95 for the slow tail.
   * @param {number} frames
   * @param {number} p
   * @returns {number}
   */
  percentileFrameTime(frames, p) {
    const n = Math.min(frames, this.count);
    if (n === 0) return 0;
    for (let i = 1; i <= n; i++) {
      this._sorted[i - 1] = this.samples[(this.index - i + this.samples.length) % this.samples.length];
    }
    const view = this._sorted.subarray(0, n);
    view.sort();
    return view[Math.min(n - 1, Math.floor(p * (n - 1)))];
  }

  /**
   * Average FPS since the last call, then resets the window (for telemetry summaries).
   * @returns {{ fpsAvg: number, frames: number }}
   */
  takeWindow() {
    const fpsAvg = this.windowSeconds > 0 ? this.windowFrames / this.windowSeconds : 0;
    const frames = this.windowFrames;
    this.windowFrames = 0;
    this.windowSeconds = 0;
    return { fpsAvg, frames };
  }
}
