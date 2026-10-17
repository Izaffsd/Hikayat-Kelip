/** Spacing of the downward scan rays in front of the character (m). */
const SCAN_STEP = 0.1;
/** A top must rise at least this much above the surface just before it to count as an edge (m). */
const MIN_RISE = 0.1;
/** Clearance tests start this far above a top so sloped roofs and lips do not count as obstruction (m). */
const CLEARANCE_LIFT = 0.15;

/**
 * @typedef {object} Edge
 * @property {number} height top above the feet (m)
 * @property {number} topY world height of the top surface at the edge
 * @property {number} standY height of the surface where the character will stand (sloped roofs rise inward)
 * @property {number} edgeX point on the edge line, in front of the character
 * @property {number} edgeZ
 * @property {number} normalX horizontal normal of the face, pointing at the character (unit)
 * @property {number} normalZ
 * @property {number} standX where the character stands after climbing (clearance checked)
 * @property {number} standZ
 * @property {any} collider collider of the face
 */

/**
 * Edge detection for traversal (TECHNICAL §5.3 "Mantle/ledge"): downward rays scanned outward in front of the
 * character find the first walkable top that rises above the surface before it (a step, a wall top, a roof eave),
 * a few more rays refine the edge, a horizontal ray just under the top finds the face (overhangs have none), a
 * deeper ray checks there is room on top, and capsule tests check the character fits at the lip and where it will
 * stand — so nothing is ever climbed through a wall. Traversal decides what the edge means (step, mantle or ledge)
 * from its height. Allocation-free: the result object is reused.
 */
export class LedgeProbe {
  /**
   * @param {import('../physics/PhysicsWorld.js').PhysicsWorld} physics
   * @param {import('../physics/CharacterController.js').CharacterController} character
   */
  constructor(physics, character) {
    this.physics = physics;
    this.cc = character;
    /** @type {Edge} */
    this.edge = {
      height: 0,
      topY: 0,
      standY: 0,
      edgeX: 0,
      edgeZ: 0,
      normalX: 0,
      normalZ: 0,
      standX: 0,
      standZ: 0,
      collider: null,
    };
    this._origin = { x: 0, y: 0, z: 0 };
    this._dir = { x: 0, y: 0, z: 0 };
    this._downDir = { x: 0, y: -1, z: 0 };
  }

  /**
   * Looks for a climbable edge in front of the feet along a horizontal direction.
   * @param {{ x: number, y: number, z: number }} feet
   * @param {number} dirX unit horizontal direction
   * @param {number} dirZ
   * @param {object} limits
   * @param {number} limits.minHeight lowest acceptable top above the feet (negative = below the feet, in the air)
   * @param {number} limits.maxHeight highest acceptable top above the feet
   * @param {number} limits.reach how far past the capsule surface the face may be
   * @param {number} limits.minDepth room needed on top, measured from the face
   * @param {number} limits.inward how far past the face the character stands after climbing
   * @returns {Edge|null} shared result, or null when there is no usable edge
   */
  find(feet, dirX, dirZ, { minHeight, maxHeight, reach, minDepth, inward }) {
    const radius = this.cc.radius;
    const startY = feet.y + maxHeight + 0.35;
    const span = maxHeight - minHeight + 0.7;
    // 1. Scan outward: the first walkable top in range that rises above the surface before it is the edge.
    let prevHeight = -Infinity;
    let near = -1;
    let far = -1;
    let topY = 0;
    let collider = null;
    for (let d = radius * 0.5; d <= radius + reach + 1e-6; d += SCAN_STEP) {
      const hit = this._down(feet, dirX, dirZ, d, startY, span);
      if (hit === null) return null; // the ray started inside geometry: never climb from there
      const h = hit.hit ? hit.point.y - feet.y : -Infinity;
      if (hit.hit && hit.normal.y >= 0.7 && h >= minHeight && h <= maxHeight && h > prevHeight + MIN_RISE) {
        near = d - SCAN_STEP;
        far = d;
        topY = hit.point.y;
        collider = hit.collider;
        break;
      }
      prevHeight = h;
    }
    if (far < 0) return null;
    // 2. Refine the edge between the last low sample and the first high one.
    for (let i = 0; i < 3; i++) {
      const mid = (near + far) / 2;
      const hit = this._down(feet, dirX, dirZ, mid, startY, span);
      if (hit && hit.hit && Math.abs(hit.point.y - topY) < MIN_RISE) {
        far = mid;
        topY = Math.max(topY, hit.point.y);
      } else {
        near = mid;
      }
    }
    const edgeDistance = far;
    const height = topY - feet.y;

    // 3. The face just under the top (overhangs such as eaves have none: face the scan direction).
    const origin = this._origin;
    const dir = this._dir;
    dir.x = dirX;
    dir.y = 0;
    dir.z = dirZ;
    origin.x = feet.x;
    origin.y = topY - 0.12;
    origin.z = feet.z;
    let normalX = -dirX;
    let normalZ = -dirZ;
    const face = this.physics.castRay(origin, dir, edgeDistance + 0.3, undefined, this.cc.collider);
    if (face.hit && Math.abs(face.normal.y) < 0.5) {
      const nh = Math.hypot(face.normal.x, face.normal.z) || 1;
      normalX = face.normal.x / nh;
      normalZ = face.normal.z / nh;
    }

    // 4. Room on top: further in there must still be a walkable surface near the same height (not a railing).
    const deep = this._down(feet, dirX, dirZ, edgeDistance + minDepth, topY + 0.8, 1.2);
    if (!deep || !deep.hit || deep.normal.y < 0.7 || Math.abs(deep.point.y - topY) > 0.3) return null;
    const stand = this._down(feet, dirX, dirZ, edgeDistance + inward, topY + 0.8, 1.2);
    if (!stand || !stand.hit || stand.normal.y < 0.7 || Math.abs(stand.point.y - topY) > 0.4) return null;
    const standY = stand.point.y;

    // 5. The character must fit at the lip and where it will stand (nothing is climbed through a wall).
    const lipX = feet.x + dirX * (edgeDistance + 0.1);
    const lipZ = feet.z + dirZ * (edgeDistance + 0.1);
    const standX = feet.x + dirX * (edgeDistance + inward);
    const standZ = feet.z + dirZ * (edgeDistance + inward);
    if (!this.cc.fitsAt(lipX, topY + CLEARANCE_LIFT, lipZ)) return null;
    if (!this.cc.fitsAt(standX, standY + CLEARANCE_LIFT, standZ)) return null;

    const edge = this.edge;
    edge.height = height;
    edge.topY = topY;
    edge.standY = standY;
    edge.edgeX = feet.x + dirX * edgeDistance;
    edge.edgeZ = feet.z + dirZ * edgeDistance;
    edge.normalX = normalX;
    edge.normalZ = normalZ;
    edge.standX = standX;
    edge.standZ = standZ;
    edge.collider = collider;
    return edge;
  }

  /**
   * Casts straight down at `distance` along the direction from the feet, from height `fromY`.
   * @returns {import('../physics/PhysicsWorld.js').RayHit|null} null when the ray starts inside geometry
   */
  _down(feet, dirX, dirZ, distance, fromY, length) {
    const origin = this._origin;
    origin.x = feet.x + dirX * distance;
    origin.y = fromY;
    origin.z = feet.z + dirZ * distance;
    const hit = this.physics.castRay(origin, this._downDir, length, undefined, this.cc.collider);
    if (hit.hit && hit.distance < 0.01) return null;
    return hit;
  }

  /**
   * Looks for a wall beside the character for a wall-run: a ray to each side of the travel direction at hip and
   * chest height; both must hit the same near-vertical surface.
   * @param {{ x: number, y: number, z: number }} feet
   * @param {number} dirX unit horizontal travel direction
   * @param {number} dirZ
   * @param {number} reach distance past the capsule surface
   * @param {-1|0|1} [onlySide=0] restrict to one side (−1 left, +1 right)
   * @returns {{ side: number, normalX: number, normalZ: number, distance: number, collider: any }|null}
   */
  side(feet, dirX, dirZ, reach, onlySide = 0) {
    const physics = this.physics;
    const origin = this._origin;
    const dir = this._dir;
    const result = (this._side ??= { side: 0, normalX: 0, normalZ: 0, distance: 0, collider: null });
    let best = Infinity;
    for (const side of [-1, 1]) {
      if (onlySide && side !== onlySide) continue;
      // Right of the travel direction is dir × up = (−dirZ, dirX); side −1 looks left.
      dir.x = side * -dirZ;
      dir.y = 0;
      dir.z = side * dirX;
      let distance = Infinity;
      let nx = 0;
      let nz = 0;
      let collider = null;
      let ok = true;
      for (const h of [0.55, 1.25]) {
        origin.x = feet.x;
        origin.y = feet.y + h;
        origin.z = feet.z;
        const hit = physics.castRay(origin, dir, this.cc.radius + reach, undefined, this.cc.collider);
        if (!hit.hit || Math.abs(hit.normal.y) > 0.2) {
          ok = false;
          break;
        }
        const nh = Math.hypot(hit.normal.x, hit.normal.z) || 1;
        if (collider && Math.abs(hit.normal.x / nh - nx) + Math.abs(hit.normal.z / nh - nz) > 0.3) {
          ok = false;
          break;
        }
        distance = Math.min(distance, hit.distance);
        nx = hit.normal.x / nh;
        nz = hit.normal.z / nh;
        collider = hit.collider;
      }
      if (!ok || distance >= best) continue;
      best = distance;
      result.side = side;
      result.normalX = nx;
      result.normalZ = nz;
      result.distance = distance;
      result.collider = collider;
    }
    return best === Infinity ? null : result;
  }

  /**
   * Distance from the feet down to the nearest surface (Infinity when nothing within `max`).
   * @param {{ x: number, y: number, z: number }} feet
   * @param {number} max
   * @returns {number}
   */
  groundBelow(feet, max) {
    const origin = this._origin;
    origin.x = feet.x;
    origin.y = feet.y + 0.05;
    origin.z = feet.z;
    const hit = this.physics.castRay(origin, this._downDir, max + 0.05, undefined, this.cc.collider);
    return hit.hit ? hit.distance - 0.05 : Infinity;
  }
}
