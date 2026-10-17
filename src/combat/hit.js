/**
 * Hit geometry for silat combat (TECHNICAL §6.1): attack spheres against upright hurt-capsules, in plain maths so
 * combat runs (and is tested) without the renderer. Allocation-free.
 */

/**
 * Whether a sphere overlaps an upright capsule standing on (cx, bottomY, cz).
 * @param {number} sx sphere centre
 * @param {number} sy
 * @param {number} sz
 * @param {number} sr sphere radius
 * @param {number} cx capsule axis x
 * @param {number} bottomY capsule bottom (feet)
 * @param {number} cz capsule axis z
 * @param {number} cr capsule radius
 * @param {number} height capsule total height
 * @returns {boolean}
 */
export function sphereHitsCapsule(sx, sy, sz, sr, cx, bottomY, cz, cr, height) {
  const y0 = bottomY + cr;
  const y1 = Math.max(y0, bottomY + height - cr);
  const y = Math.min(y1, Math.max(y0, sy));
  const dx = sx - cx;
  const dy = sy - y;
  const dz = sz - cz;
  const r = sr + cr;
  return dx * dx + dy * dy + dz * dz <= r * r;
}

/**
 * Centre of an attack sphere `forward` metres ahead of the feet along a yaw, at `height`.
 * @param {{ x: number, y: number, z: number }} feet
 * @param {number} yaw radians (0 faces +Z)
 * @param {{ forward: number, height: number }} shape
 * @param {{ x: number, y: number, z: number }} out
 * @returns {{ x: number, y: number, z: number }}
 */
export function attackCentre(feet, yaw, shape, out) {
  out.x = feet.x + Math.sin(yaw) * shape.forward;
  out.y = feet.y + shape.height;
  out.z = feet.z + Math.cos(yaw) * shape.forward;
  return out;
}

/**
 * Whether a target lies within a cone in front of a yaw (horizontal plane).
 * @param {number} fromX
 * @param {number} fromZ
 * @param {number} yaw
 * @param {number} toX
 * @param {number} toZ
 * @param {number} halfAngle radians
 * @returns {boolean}
 */
export function inFront(fromX, fromZ, yaw, toX, toZ, halfAngle) {
  const dx = toX - fromX;
  const dz = toZ - fromZ;
  const len = Math.hypot(dx, dz);
  if (len < 1e-4) return true;
  return (dx * Math.sin(yaw) + dz * Math.cos(yaw)) / len >= Math.cos(halfAngle);
}
