import RAPIER from '@dimforge/rapier3d-compat';

/** Collision membership bits (TECHNICAL §5.1). */
export const GROUP = Object.freeze({
  WORLD: 0x0001,
  PLAYER: 0x0002,
  ENEMY: 0x0004,
  NPC: 0x0008,
  TRIGGER: 0x0010,
  CAMERA: 0x0020,
  PROJECTILE: 0x0040,
  WATER: 0x0080,
  ALL: 0xffff,
});

/**
 * Packs Rapier interaction groups: 16 bits membership, 16 bits filter.
 * @param {number} membership
 * @param {number} filter
 * @returns {number}
 */
export function interactionGroups(membership, filter) {
  return (((membership & 0xffff) << 16) | (filter & 0xffff)) >>> 0;
}

/**
 * @typedef {object} RayHit
 * @property {boolean} hit
 * @property {number} distance
 * @property {{ x: number, y: number, z: number }} point
 * @property {{ x: number, y: number, z: number }} normal
 * @property {import('@dimforge/rapier3d-compat').Collider|null} collider
 */

/**
 * Owns the Rapier world: fixed stepping, collision events, queries with reusable scratch objects,
 * and interpolation of rendered objects between physics ticks.
 */
export class PhysicsWorld {
  /**
   * Initialises the Rapier WASM module and creates a world.
   * @param {object} [options]
   * @param {number} [options.gravity=-9.81]
   * @returns {Promise<PhysicsWorld>}
   */
  static async create({ gravity = -9.81 } = {}) {
    await RAPIER.init();
    return new PhysicsWorld(RAPIER, gravity);
  }

  /**
   * @param {typeof RAPIER} R initialised Rapier module
   * @param {number} gravity
   */
  constructor(R, gravity) {
    this.R = R;
    this.world = new R.World({ x: 0, y: gravity, z: 0 });
    this.world.timestep = 1 / 60;
    this.eventQueue = new R.EventQueue(true);
    /** @type {Array<{ body: any, object: import('three').Object3D, prev: Float64Array, curr: Float64Array }>} */
    this.bindings = [];
    /** @type {Map<number, (otherHandle: number, started: boolean) => void>} sensor collider handle → callback */
    this.sensorHandlers = new Map();
    this._ray = new R.Ray({ x: 0, y: 0, z: 0 }, { x: 0, y: -1, z: 0 });
    /** @type {RayHit} */
    this._rayHit = {
      hit: false,
      distance: 0,
      point: { x: 0, y: 0, z: 0 },
      normal: { x: 0, y: 1, z: 0 },
      collider: null,
    };
    this._identityRotation = { x: 0, y: 0, z: 0, w: 1 };
  }

  /**
   * Advances the simulation by one fixed tick, then dispatches sensor events and snapshots bindings.
   * @param {number} dt
   */
  step(dt) {
    for (const binding of this.bindings) binding.prev.set(binding.curr);
    this.world.timestep = dt;
    this.world.step(this.eventQueue);
    this.eventQueue.drainCollisionEvents((handle1, handle2, started) => {
      this.sensorHandlers.get(handle1)?.(handle2, started);
      this.sensorHandlers.get(handle2)?.(handle1, started);
    });
    for (const binding of this.bindings) snapshot(binding.body, binding.curr);
  }

  /**
   * Makes `object` follow `body` with interpolation between ticks.
   * @param {any} body Rapier rigid body
   * @param {import('three').Object3D} object
   * @returns {() => void} unbind
   */
  bind(body, object) {
    const binding = { body, object, prev: new Float64Array(7), curr: new Float64Array(7) };
    snapshot(body, binding.curr);
    binding.prev.set(binding.curr);
    this.bindings.push(binding);
    return () => {
      const index = this.bindings.indexOf(binding);
      if (index >= 0) this.bindings.splice(index, 1);
    };
  }

  /**
   * Applies interpolated transforms to bound objects (called once per rendered frame).
   * @param {number} alpha 0..1 between the previous and current tick
   */
  interpolate(alpha) {
    for (const { object, prev, curr } of this.bindings) {
      object.position.set(
        prev[0] + (curr[0] - prev[0]) * alpha,
        prev[1] + (curr[1] - prev[1]) * alpha,
        prev[2] + (curr[2] - prev[2]) * alpha,
      );
      nlerpQuaternion(prev, curr, alpha, object.quaternion);
    }
  }

  /**
   * Fixed axis-aligned (or rotated) box collider.
   * @param {{ x: number, y: number, z: number }} center
   * @param {{ x: number, y: number, z: number }} halfExtents
   * @param {object} [options]
   * @param {{ x: number, y: number, z: number, w: number }} [options.rotation]
   * @param {number} [options.groups]
   * @param {number} [options.friction=0.8]
   * @returns {any} collider
   */
  addStaticBox(
    center,
    halfExtents,
    { rotation, groups = interactionGroups(GROUP.WORLD, GROUP.ALL), friction = 0.8 } = {},
  ) {
    const desc = this.R.ColliderDesc.cuboid(halfExtents.x, halfExtents.y, halfExtents.z)
      .setTranslation(center.x, center.y, center.z)
      .setCollisionGroups(groups)
      .setFriction(friction);
    if (rotation) desc.setRotation(rotation);
    return this.world.createCollider(desc);
  }

  /**
   * Fixed triangle-mesh collider (use sparingly; prefer boxes and hulls).
   * @param {Float32Array} vertices
   * @param {Uint32Array} indices
   * @param {number} [groups]
   * @returns {any} collider
   */
  addStaticTrimesh(vertices, indices, groups = interactionGroups(GROUP.WORLD, GROUP.ALL)) {
    return this.world.createCollider(
      this.R.ColliderDesc.trimesh(vertices, indices).setCollisionGroups(groups),
    );
  }

  /**
   * Casts a ray against colliders; returns a shared result object (copy what you need).
   * @param {{ x: number, y: number, z: number }} origin
   * @param {{ x: number, y: number, z: number }} direction normalised
   * @param {number} maxDistance
   * @param {number} [groups]
   * @param {any} [excludeCollider]
   * @returns {RayHit}
   */
  castRay(
    origin,
    direction,
    maxDistance,
    groups = interactionGroups(GROUP.ALL, GROUP.WORLD),
    excludeCollider,
  ) {
    const ray = this._ray;
    ray.origin.x = origin.x;
    ray.origin.y = origin.y;
    ray.origin.z = origin.z;
    ray.dir.x = direction.x;
    ray.dir.y = direction.y;
    ray.dir.z = direction.z;
    const out = this._rayHit;
    const hit = this.world.castRayAndGetNormal(
      ray,
      maxDistance,
      true,
      this.R.QueryFilterFlags.EXCLUDE_SENSORS,
      groups,
      excludeCollider,
    );
    if (!hit) {
      out.hit = false;
      out.collider = null;
      return out;
    }
    out.hit = true;
    out.distance = hit.timeOfImpact;
    out.point.x = origin.x + direction.x * hit.timeOfImpact;
    out.point.y = origin.y + direction.y * hit.timeOfImpact;
    out.point.z = origin.z + direction.z * hit.timeOfImpact;
    out.normal.x = hit.normal.x;
    out.normal.y = hit.normal.y;
    out.normal.z = hit.normal.z;
    out.collider = hit.collider;
    return out;
  }

  /**
   * Sweeps a sphere from `origin` along `direction`; returns the distance to the first hit or `maxDistance`.
   * @param {any} ball a Rapier Ball shape (reuse one per caller)
   * @param {{ x: number, y: number, z: number }} origin
   * @param {{ x: number, y: number, z: number }} direction normalised
   * @param {number} maxDistance
   * @param {number} [groups]
   * @returns {number}
   */
  sphereCast(ball, origin, direction, maxDistance, groups = interactionGroups(GROUP.CAMERA, GROUP.WORLD)) {
    const hit = this.world.castShape(
      origin,
      this._identityRotation,
      direction,
      ball,
      0,
      maxDistance,
      true,
      this.R.QueryFilterFlags.EXCLUDE_SENSORS,
      groups,
    );
    return hit ? hit.time_of_impact : maxDistance;
  }

  /**
   * Registers a callback for sensor enter/exit events on a collider (requires ActiveEvents on it).
   * @param {any} collider
   * @param {(otherHandle: number, started: boolean) => void} handler
   */
  onSensor(collider, handler) {
    this.sensorHandlers.set(collider.handle, handler);
  }

  /** Number of rigid bodies (debug overlay). */
  get bodyCount() {
    return this.world.bodies.len();
  }

  /** Number of colliders (debug overlay). */
  get colliderCount() {
    return this.world.colliders.len();
  }

  /** Frees the world. */
  dispose() {
    this.eventQueue.free();
    this.world.free();
    this.bindings.length = 0;
  }
}

/**
 * Writes a body's translation and rotation into a 7-float buffer.
 * @param {any} body
 * @param {Float64Array} out
 */
function snapshot(body, out) {
  const t = body.translation();
  const r = body.rotation();
  out[0] = t.x;
  out[1] = t.y;
  out[2] = t.z;
  out[3] = r.x;
  out[4] = r.y;
  out[5] = r.z;
  out[6] = r.w;
}

/**
 * Normalised linear interpolation of the quaternions stored at [3..6] (shortest path).
 * @param {Float64Array} a
 * @param {Float64Array} b
 * @param {number} t
 * @param {import('three').Quaternion} out
 */
function nlerpQuaternion(a, b, t, out) {
  const dot = a[3] * b[3] + a[4] * b[4] + a[5] * b[5] + a[6] * b[6];
  const sign = dot < 0 ? -1 : 1;
  const x = a[3] + (b[3] * sign - a[3]) * t;
  const y = a[4] + (b[4] * sign - a[4]) * t;
  const z = a[5] + (b[5] * sign - a[5]) * t;
  const w = a[6] + (b[6] * sign - a[6]) * t;
  const len = Math.hypot(x, y, z, w) || 1;
  out.set(x / len, y / len, z / len, w / len);
}
