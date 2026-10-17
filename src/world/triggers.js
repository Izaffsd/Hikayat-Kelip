/**
 * Layout trigger volumes (boxes or spheres from data/regions/<id>.json), as plain maths so missions and encounters
 * can test them without the renderer.
 */

/**
 * Whether a point is inside a trigger.
 * @param {{ center: { x: number, y: number, z: number }, half: { x: number, y: number, z: number }|null,
 *   radius: number }} trigger
 * @param {{ x: number, y: number, z: number }} p
 * @returns {boolean}
 */
export function insideTrigger(trigger, p) {
  const c = trigger.center;
  if (trigger.half) {
    return (
      Math.abs(p.x - c.x) <= trigger.half.x &&
      Math.abs(p.y - c.y) <= trigger.half.y &&
      Math.abs(p.z - c.z) <= trigger.half.z
    );
  }
  const dx = p.x - c.x;
  const dy = p.y - c.y;
  const dz = p.z - c.z;
  return dx * dx + dy * dy + dz * dz <= trigger.radius * trigger.radius;
}
