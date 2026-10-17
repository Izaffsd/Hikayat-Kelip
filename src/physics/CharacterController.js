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
    /** Standing half height (the capsule shrinks while sliding). */
    this.standHalfHeight = halfHeight;
    /** Whether the capsule is currently shrunk. */
    this.crouched = false;
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
    /** Whether the last move touched a wall (a surface too steep to climb); its normal is in `wallNormal`. */
    this.hitWall = false;
    /** Horizontal normal of the wall touched by the last move (unit, y = 0). */
    this.wallNormal = { x: 0, y: 0, z: 0 };
    this._wallLimitY = Math.cos(kcc.maxSlopeClimbDeg * DEG) - 0.02;
    this._desired = { x: 0, y: 0, z: 0 };
    this._next = { x: 0, y: 0, z: 0 };
    /** Reused collision record (Rapier fills it in place). */
    this._collision = new R.CharacterCollision();
    this._probeCenter = { x: 0, y: 0, z: 0 };
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
    this.hitWall = false;
    const count = this.kcc.numComputedCollisions();
    for (let i = 0; i < count; i++) {
      const collision = this.kcc.computedCollision(i, this._collision);
      if (!collision) continue;
      const n = collision.normal1;
      const ny = n.y;
      if (ny > 0.05 && (this.groundNormalY === 0 || ny < this.groundNormalY)) this.groundNormalY = ny;
      if (ny < -0.7 && dy > 0) this.hitCeiling = true;
      if (ny < this._wallLimitY && ny > -0.7) {
        const h = Math.hypot(n.x, n.z);
        if (h > 1e-4) {
          this.hitWall = true;
          this.wallNormal.x = n.x / h;
          this.wallNormal.z = n.z / h;
        }
      }
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
   * Moves the capsule to a feet position without collision, keeping render interpolation from the previous spot
   * (scripted motion: mantles, ledge climbs). The caller checks clearance first.
   * @param {number} x
   * @param {number} y feet height
   * @param {number} z
   */
  place(x, y, z) {
    this.prevPosition.x = this.position.x;
    this.prevPosition.y = this.position.y;
    this.prevPosition.z = this.position.z;
    this.position.x = x;
    this.position.y = y + this.centerOffset;
    this.position.z = z;
    this.lastMovement.x = this.position.x - this.prevPosition.x;
    this.lastMovement.y = this.position.y - this.prevPosition.y;
    this.lastMovement.z = this.position.z - this.prevPosition.z;
    this.body.setNextKinematicTranslation(this.position);
    this.grounded = false;
    this.hitWall = false;
    this.hitCeiling = false;
  }

  /**
   * Shrinks the capsule (slide) or restores it, keeping the feet where they are.
   * @param {boolean} crouched
   * @param {number} [crouchHalfHeight]
   */
  setCrouched(crouched, crouchHalfHeight = 0.15) {
    if (crouched === this.crouched) return;
    const feet = this.feetY;
    const prevFeet = this.prevPosition.y - this.centerOffset;
    this.crouched = crouched;
    this.halfHeight = crouched ? crouchHalfHeight : this.standHalfHeight;
    this.centerOffset = this.halfHeight + this.radius;
    this.collider.setHalfHeight(this.halfHeight);
    this.position.y = feet + this.centerOffset;
    this.prevPosition.y = prevFeet + this.centerOffset;
    this.body.setTranslation(this.position, true);
    this.body.setNextKinematicTranslation(this.position);
  }

  /**
   * Whether the standing capsule fits at the current spot (stand up from a slide only when it does).
   * @returns {boolean}
   */
  canStand() {
    const centerY = this.feetY + this.standHalfHeight + this.radius + 0.02;
    this._probeCenter.x = this.position.x;
    this._probeCenter.y = centerY;
    this._probeCenter.z = this.position.z;
    return !this.physics.capsuleOverlaps(
      this._probeCenter,
      this.standHalfHeight,
      this.radius - 0.02,
      undefined,
      this.collider,
    );
  }

  /**
   * Whether the standing capsule fits with its feet at a point (mantle and ledge targets).
   * @param {number} x
   * @param {number} y feet height
   * @param {number} z
   * @returns {boolean}
   */
  fitsAt(x, y, z) {
    this._probeCenter.x = x;
    this._probeCenter.y = y + this.standHalfHeight + this.radius + 0.03;
    this._probeCenter.z = z;
    return !this.physics.capsuleOverlaps(
      this._probeCenter,
      this.standHalfHeight,
      this.radius - 0.02,
      undefined,
      this.collider,
    );
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
