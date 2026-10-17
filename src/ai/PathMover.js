const clamp01 = (v) => Math.min(1, Math.max(0, v));

/**
 * Moves a scripted actor along a layout path (Tok Belang's flight, Adi's race and his flight over the roofs): the
 * path's points are feet positions; distance runs along the ground (horizontal length); where a segment steps up or
 * down by more than `leapMinRise` the actor leaps it in an arc. Also keeps a lead on the player: `leadSpeed` gives
 * the speed that holds the actor `lead` metres ahead along the path — bolting when the player closes in, slowing
 * and waiting when he falls behind. Plain maths, no allocation per call.
 */
export class PathMover {
  /**
   * @param {{ leapHeight: number, leapMinRise: number }} tuning
   */
  constructor(tuning) {
    this.tuning = tuning;
    /** @type {Array<{ x: number, y: number, z: number }>} */
    this.points = [];
    /** Cumulative horizontal length at each point. */
    this.cum = [];
    /** Distance travelled along the path. */
    this.s = 0;
    /** Height of the leap arc at `s` (0 on the ground). */
    this.lift = 0;
    /** Direction of travel at `s` (radians, 0 = +Z). */
    this.heading = 0;
  }

  /**
   * @param {Array<{ x: number, y: number, z: number }>} points at least two
   */
  setPath(points) {
    this.points = points;
    this.cum = [0];
    for (let i = 1; i < points.length; i++) {
      const a = points[i - 1];
      const b = points[i];
      this.cum.push(this.cum[i - 1] + Math.hypot(b.x - a.x, b.z - a.z));
    }
    this.s = 0;
    this.heading = Math.atan2(points[1].x - points[0].x, points[1].z - points[0].z);
  }

  /** Total horizontal length. */
  get length() {
    return this.cum[this.cum.length - 1] ?? 0;
  }

  /** Whether the end has been reached. */
  get done() {
    return this.s >= this.length;
  }

  /**
   * Advances by `distance` (clamped to the end) and writes the feet position into `out`.
   * @param {number} distance
   * @param {{ x: number, y: number, z: number, set?: Function }} out
   */
  advance(distance, out) {
    this.s = Math.min(this.length, this.s + Math.max(0, distance));
    this.positionAt(this.s, out);
  }

  /**
   * Feet position at distance `s` (also updates `lift` and `heading`).
   * @param {number} s
   * @param {{ x: number, y: number, z: number }} out
   */
  positionAt(s, out) {
    const pts = this.points;
    let i = 1;
    while (i < pts.length - 1 && this.cum[i] < s) i++;
    const a = pts[i - 1];
    const b = pts[i];
    const span = this.cum[i] - this.cum[i - 1] || 1;
    const u = clamp01((s - this.cum[i - 1]) / span);
    const rise = b.y - a.y;
    this.lift = Math.abs(rise) > this.tuning.leapMinRise ? this.tuning.leapHeight * 4 * u * (1 - u) : 0;
    out.x = a.x + (b.x - a.x) * u;
    out.y = a.y + rise * u + this.lift;
    out.z = a.z + (b.z - a.z) * u;
    this.heading = Math.atan2(b.x - a.x, b.z - a.z);
  }

  /**
   * Distance along the path of the point on it nearest to `q` (horizontal).
   * @param {{ x: number, z: number }} q
   * @returns {number}
   */
  project(q) {
    const pts = this.points;
    let best = Infinity;
    let at = 0;
    for (let i = 1; i < pts.length; i++) {
      const a = pts[i - 1];
      const b = pts[i];
      const ex = b.x - a.x;
      const ez = b.z - a.z;
      const len2 = ex * ex + ez * ez || 1;
      const t = clamp01(((q.x - a.x) * ex + (q.z - a.z) * ez) / len2);
      const px = a.x + ex * t - q.x;
      const pz = a.z + ez * t - q.z;
      const d = px * px + pz * pz;
      if (d < best) {
        best = d;
        at = this.cum[i - 1] + t * (this.cum[i] - this.cum[i - 1]);
      }
    }
    return at;
  }

  /**
   * The speed that keeps the actor ahead of the player: below half the lead it bolts (`catchUpSpeed`), up to the lead
   * it runs (`runSpeed`), then slows to a stop at `leadMax` and waits.
   * @param {{ x: number, z: number }} player
   * @param {{ lead: number, leadMax: number, runSpeed: number, catchUpSpeed: number }} t
   * @returns {number}
   */
  leadSpeed(player, t) {
    const lead = this.s - this.project(player);
    if (lead < t.lead * 0.5) return t.catchUpSpeed;
    if (lead <= t.lead) return t.runSpeed;
    return t.runSpeed * clamp01(1 - (lead - t.lead) / (t.leadMax - t.lead));
  }
}

/**
 * @param {number} a radians
 * @returns {number} in [-π, π]
 */
export function wrapAngle(a) {
  return Math.atan2(Math.sin(a), Math.cos(a));
}
