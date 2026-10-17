/**
 * Bayu's body sounds (TECHNICAL §10): footsteps paced by distance travelled (a stride that lengthens with speed)
 * on the surface underfoot (wood, attap thatch, mud, shallow water), wall-run steps, and landings by impact speed.
 * Logic only: it calls `play(id, options)` and asks `surfaceAt()` what is underfoot, so it is unit-tested.
 */
export class Foley {
  /**
   * @param {object} options
   * @param {(id: string, options?: object) => unknown} options.play
   * @param {() => 'wood'|'thatch'|'mud'|'water'} options.surfaceAt
   * @param {object} options.tuning data/audio/sounds.json `foley`
   * @param {() => number} [options.random]
   */
  constructor({ play, surfaceAt, tuning, random = Math.random }) {
    Object.assign(this, { play, surfaceAt, tuning, random });
    this._travel = 0;
    this.steps = 0;
  }

  /**
   * One fixed tick.
   * @param {number} dt
   * @param {string} state traversal state
   * @param {number} speed horizontal m/s
   */
  fixedUpdate(dt, state, speed) {
    const t = this.tuning;
    const walking = (state === 'ground' || state === 'wallRun') && speed >= t.minSpeed;
    if (!walking) {
      // The first step after starting to move comes quickly.
      this._travel = this.stride(t.minSpeed) * t.firstStep;
      return;
    }
    const stride = this.stride(speed) * (state === 'wallRun' ? t.wallRunStride : 1);
    this._travel += speed * dt;
    if (this._travel < stride) return;
    this._travel = Math.min(this._travel - stride, stride * 0.5);
    this.step(speed, state === 'wallRun' ? 'wood' : this.surfaceAt());
  }

  /**
   * Distance between footfalls at `speed` (each foot).
   * @param {number} speed
   */
  stride(speed) {
    const t = this.tuning;
    const k = Math.min(1, Math.max(0, (speed - t.walkSpeed) / (t.runSpeed - t.walkSpeed)));
    return t.strideWalk + (t.strideRun - t.strideWalk) * k;
  }

  /**
   * A footfall.
   * @param {number} speed
   * @param {string} surface
   */
  step(speed, surface) {
    const t = this.tuning;
    const k = Math.min(1, Math.max(0, (speed - t.walkSpeed) / (t.runSpeed - t.walkSpeed)));
    const gain = t.stepGain.walk + (t.stepGain.run - t.stepGain.walk) * k + (this.random() - 0.5) * 2;
    this.steps++;
    this.play(t.steps[surface] ?? t.steps.wood, { gain, rate: 0.94 + this.random() * 0.12 });
  }

  /**
   * Touching down.
   * @param {number} speed vertical impact speed, m/s
   */
  land(speed) {
    const t = this.tuning;
    if (speed < t.landMinSpeed) return;
    this._travel = 0;
    const surface = this.surfaceAt();
    const heavy = speed >= t.landHeavySpeed && surface !== 'water';
    const k = Math.min(1, (speed - t.landMinSpeed) / (t.landHeavySpeed - t.landMinSpeed));
    const gain = t.landGain.soft + (t.landGain.hard - t.landGain.soft) * k;
    this.play(heavy ? t.landHeavy : (t.land[surface] ?? t.land.wood), {
      gain,
      rate: 0.95 + this.random() * 0.1,
    });
  }
}
