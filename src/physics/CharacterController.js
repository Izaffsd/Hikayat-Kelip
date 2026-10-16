import { GROUP, interactionGroups } from './PhysicsWorld.js';

const DEG = Math.PI / 180;

/**
 * Kinematic capsule driven by Rapier's KinematicCharacterController (autostep, snap-to-ground,
 * slope limits). Gameplay code computes a desired displacement each tick and calls `move()`;
 * the controller resolves collisions and reports grounded state and contact normals.
 *
 * The position is tracked locally so a tick allocates nothing (Rapier's `translation()` allocates).
 */
export class CharacterController {
  /**
   * @param {import('./PhysicsWorld.js').PhysicsWorld} physics
   * @param {object} tuning data/tuning/player.json
   * @param {{ x: number, y: number, z: number }} spawn feet position
   */
  constructor(physics, tuning, spawn) {
    const R = physics.R;
    const { radius, halfHeight } = tuning.capsule;
    const kcc = tuning.kcc;
    this.physics = physics;
    this.radius = radius;
    this.halfHeight = halfHeight;
    /** Distance from the feet to the capsule centre. */
    this.centerOffset = halfHeight + radius;
    /** Capsule centre position (world). */
    this.position = { x: spawn.x, y: spawn.y + this.centerOffset, z: spawn.z };
    /** Position at the start of the last tick (for render interpolation). */
    this.prevPosition = { ...this.position };

    this.body = physics.world.createRigidBody(
      R.RigidBodyDesc.kinematicPositionBased().setTranslation(
        this.position.x,
        this.position.y,
        this.position.z,
      ),
    );
    this.collider = physics.world.createCollider(
      R.ColliderDesc.capsule(halfHeight, radius)
        .setCollisionGroups(interactionGroups(GROUP.PLAYER, GROUP.WORLD | GROUP.TRIGGER | GROUP.WATER))
        .setActiveEvents(R.ActiveEvents.COLLISION_EVENTS),
      this.body,
    );

    this.kcc = physics.world.createCharacterController(kcc.offset);
    this.kcc.setUp({ x: 0, y: 1, z: 0 });
    this.kcc.enableAutostep(kcc.autostepMaxHeight, kcc.autostepMinWidth, false);
    this.kcc.enableSnapToGround(kcc.snapToGround);
    this.kcc.setMaxSlopeClimbAngle(kcc.maxSlopeClimbDeg * DEG);
    this.kcc.setMinSlopeSlideAngle(kcc.minSlopeSlideDeg * DEG);
    this.kcc.setApplyImpulsesToDynamicBodies(true);
    this.kcc.setSlideEnabled(true);

    this.filterGroups = interactionGroups(GROUP.PLAYER, GROUP.WORLD);
    /** Whether the last move ended on the ground. */
    this.grounded = false;
    /** Movement actually applied by the last move. */
    this.lastMovement = { x: 0, y: 0, z: 0 };
    /** Up component of the most upward-facing contact normal in the last move (1 = flat floor). */
    this.groundNormalY = 1;
    /** Whether the last move hit something above (head bump). */
    this.hitCeiling = false;
    this._desired = { x: 0, y: 0, z: 0 };
    this._next = { x: 0, y: 0, z: 0 };
    /** Reused collision record (Rapier fills it in place). */
    this._collision = new R.CharacterCollision();
  }

  /**
   * Moves by a desired displacement, resolving collisions. Call once per fixed tick, before the world step.
   * @param {number} dx
   * @param {number} dy
   * @param {number} dz
   * @returns {{ x: number, y: number, z: number }} applied movement (shared object)
   */
  move(dx, dy, dz) {
    this.prevPosition.x = this.position.x;
    this.prevPosition.y = this.position.y;
    this.prevPosition.z = this.position.z;
    const desired = this._desired;
    desired.x = dx;
    desired.y = dy;
    desired.z = dz;
    this.kcc.computeColliderMovement(
      this.collider,
      desired,
      this.physics.R.QueryFilterFlags.EXCLUDE_SENSORS,
      this.filterGroups,
    );
    const movement = this.kcc.computedMovement(this.lastMovement);
    this.grounded = this.kcc.computedGrounded();
    this.groundNormalY = this.grounded ? 1 : 0;
    this.hitCeiling = false;
    const count = this.kcc.numComputedCollisions();
    for (let i = 0; i < count; i++) {
      const collision = this.kcc.computedCollision(i, this._collision);
      if (!collision) continue;
      const ny = collision.normal1.y;
      if (ny > 0.05 && (this.groundNormalY === 0 || ny < this.groundNormalY)) this.groundNormalY = ny;
      if (ny < -0.7 && dy > 0) this.hitCeiling = true;
    }
    const next = this._next;
    next.x = this.position.x + movement.x;
    next.y = this.position.y + movement.y;
    next.z = this.position.z + movement.z;
    this.body.setNextKinematicTranslation(next);
    this.position.x = next.x;
    this.position.y = next.y;
    this.position.z = next.z;
    return movement;
  }

  /**
   * Teleports the character (respawn, cutscenes). Feet position.
   * @param {{ x: number, y: number, z: number }} feet
   */
  teleport(feet) {
    this.position.x = feet.x;
    this.position.y = feet.y + this.centerOffset;
    this.position.z = feet.z;
    this.prevPosition.x = this.position.x;
    this.prevPosition.y = this.position.y;
    this.prevPosition.z = this.position.z;
    this.body.setTranslation(this.position, true);
    this.body.setNextKinematicTranslation(this.position);
    this.grounded = false;
  }

  /** Feet Y of the current position. */
  get feetY() {
    return this.position.y - this.centerOffset;
  }

  /**
   * Interpolated feet position for rendering.
   * @param {number} alpha 0..1 between the previous and current tick
   * @param {{ x: number, y: number, z: number }} out
   * @returns {{ x: number, y: number, z: number }}
   */
  interpolatedFeet(alpha, out) {
    const p = this.prevPosition;
    const c = this.position;
    out.x = p.x + (c.x - p.x) * alpha;
    out.y = p.y + (c.y - p.y) * alpha - this.centerOffset;
    out.z = p.z + (c.z - p.z) * alpha;
    return out;
  }
}
