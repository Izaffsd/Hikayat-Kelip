/**
 * Ghost runs (GDD pillar 5): a run is recorded as feet position and facing at a fixed rate, quantized to
 * centimetres and centiradians (a 15 s run at 20 Hz is ~300 samples, a few KB in the save), and played back by
 * interpolating between samples. Progress along the trial's line is precomputed per sample so the live delta
 * ("−0.42") compares like with like.
 */

/** Save format version of a ghost. */
export const GHOST_VERSION = 1;

/**
 * Records one run.
 */
export class GhostRecorder {
  /**
   * @param {number} hz samples per second
   */
  constructor(hz) {
    this.hz = hz;
    /** @type {number[]} x, y, z (cm), yaw (centiradians) per sample */
    this.samples = [];
    this._next = 0;
  }

  /** Starts a new run. */
  begin() {
    this.samples.length = 0;
    this._next = 0;
  }

  /**
   * Records a sample when the run's clock has reached the next sample time.
   * @param {number} seconds time into the run
   * @param {{ x: number, y: number, z: number }} feet
   * @param {number} yaw
   */
  sample(seconds, feet, yaw) {
    if (seconds + 1e-6 < this._next / this.hz) return;
    this.samples.push(
      Math.round(feet.x * 100),
      Math.round(feet.y * 100),
      Math.round(feet.z * 100),
      Math.round(yaw * 100),
    );
    this._next++;
  }

  /**
   * The finished run, ready for the save.
   * @param {number} seconds the run's time
   * @returns {{ v: number, hz: number, time: number, samples: number[] }}
   */
  finish(seconds) {
    return { v: GHOST_VERSION, hz: this.hz, time: seconds, samples: [...this.samples] };
  }
}

/**
 * Plays a recorded run back: where the ghost is at a time, and what time it reached a distance along the line.
 */
export class GhostTrack {
  /**
   * @param {{ v: number, hz: number, time: number, samples: number[] }} ghost
   * @param {(p: { x: number, z: number }) => number} [project] distance along the trial's line
   */
  constructor(ghost, project = null) {
    if (ghost.v !== GHOST_VERSION) throw new Error(`Ghost: unknown version ${ghost.v}`);
    this.hz = ghost.hz;
    this.time = ghost.time;
    this.samples = ghost.samples;
    this.count = Math.floor(this.samples.length / 4);
    /** Running maximum of progress per sample (never decreasing, so a search works). */
    this.progress = new Float32Array(this.count);
    if (project) {
      let best = -Infinity;
      const p = { x: 0, z: 0 };
      for (let i = 0; i < this.count; i++) {
        p.x = this.samples[i * 4] / 100;
        p.z = this.samples[i * 4 + 2] / 100;
        best = Math.max(best, project(p));
        this.progress[i] = best;
      }
    }
  }

  /**
   * Writes the ghost's feet position at `seconds` into `out` and returns its facing and horizontal speed.
   * @param {number} seconds
   * @param {{ x: number, y: number, z: number }} out
   * @returns {{ yaw: number, speed: number }}
   */
  at(seconds, out, result = { yaw: 0, speed: 0 }) {
    const f = Math.min(this.count - 1, Math.max(0, seconds * this.hz));
    const i = Math.min(this.count - 2, Math.floor(f));
    const u = this.count > 1 ? f - i : 0;
    const s = this.samples;
    const a = i * 4;
    const b = Math.min(this.count - 1, i + 1) * 4;
    out.x = (s[a] + (s[b] - s[a]) * u) / 100;
    out.y = (s[a + 1] + (s[b + 1] - s[a + 1]) * u) / 100;
    out.z = (s[a + 2] + (s[b + 2] - s[a + 2]) * u) / 100;
    let dyaw = (s[b + 3] - s[a + 3]) / 100;
    dyaw = Math.atan2(Math.sin(dyaw), Math.cos(dyaw));
    result.yaw = s[a + 3] / 100 + dyaw * u;
    result.speed = (Math.hypot(s[b] - s[a], s[b + 2] - s[a + 2]) / 100) * this.hz;
    return result;
  }

  /**
   * The time the ghost first reached `distance` along the line (Infinity if it never did).
   * @param {number} distance
   * @returns {number}
   */
  timeAt(distance) {
    let lo = 0;
    let hi = this.count - 1;
    if (this.count === 0 || this.progress[hi] < distance) return Infinity;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (this.progress[mid] >= distance) hi = mid;
      else lo = mid + 1;
    }
    return lo / this.hz;
  }
}
