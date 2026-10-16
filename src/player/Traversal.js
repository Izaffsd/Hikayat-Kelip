import { EV } from '../core/events.js';

const TWO_PI = Math.PI * 2;

/**
 * Movement state machine for Bayu (TECHNICAL §5.3). This first slice implements grounded running
 * and jumping with the GDD's feel rules: coyote time, jump buffer, variable jump height, apex hang,
 * heavier falls, momentum carry, sprint that builds by itself, and respawn at the last safe ground.
 * Later states (mantle, wall-run, slide, glide…) plug into the same structure.
 */
export class Traversal {
  /**
   * @param {object} options
   * @param {import('../physics/CharacterController.js').CharacterController} options.character
   * @param {object} options.tuning data/tuning/player.json
   * @param {import('../core/Input.js').Input} options.input
   * @param {import('../core/Time.js').Time} options.time
   * @param {import('../core/EventBus.js').EventBus} options.bus
   */
  constructor({ character, tuning, input, time, bus }) {
    this.cc = character;
    this.tuning = tuning;
    this.input = input;
    this.time = time;
    this.bus = bus;
    /** @type {'ground'|'air'} */
    this.state = 'ground';
    this.velocity = { x: 0, y: 0, z: 0 };
    /** Facing yaw (radians); 0 faces +Z. */
    this.facing = 0;
    this.prevFacing = 0;
    /** Current horizontal speed (m/s). */
    this.speed = 0;
    this.sprinting = false;
    this._fullTiltTime = 0;
    this._lastGroundedTick = -1e9;
    this._jumping = false;
    this._jumpCutApplied = false;
    this._jumpTime = 0;
    this._safeTime = 0;
    this.lastSafe = { x: character.position.x, y: character.feetY, z: character.position.z };
    this._coyoteTicks = time.secondsToTicks(tuning.jump.coyoteTime);
    this._bufferTicks = time.secondsToTicks(tuning.jump.bufferTime);
    this._jumpVelocity = Math.sqrt(2 * tuning.gravity * tuning.jump.height);
  }

  /**
   * One fixed tick of movement.
   * @param {number} dt
   * @param {{ x: number, z: number, magnitude: number, sprintHeld: boolean }} intent
   */
  fixedUpdate(dt, intent) {
    const { move, jump, gravity } = this.tuning;
    const v = this.velocity;
    const tick = this.time.tick;
    const wasGrounded = this.cc.grounded;
    this.prevFacing = this.facing;

    // --- Horizontal: target speed from stick magnitude; sprint builds after sustained full tilt.
    let targetSpeed = 0;
    if (intent.magnitude > 0.05) {
      if (intent.magnitude < move.stickRunThreshold) {
        targetSpeed = move.walkSpeed * (intent.magnitude / move.stickRunThreshold);
        this._fullTiltTime = 0;
      } else {
        targetSpeed = move.runSpeed;
        this._fullTiltTime = intent.magnitude >= move.stickSprintThreshold ? this._fullTiltTime + dt : 0;
        if (intent.sprintHeld || this._fullTiltTime >= move.sprintBuildTime) targetSpeed = move.sprintSpeed;
      }
    } else {
      this._fullTiltTime = 0;
    }
    this.sprinting = targetSpeed >= move.sprintSpeed;
    const targetX = intent.x * targetSpeed;
    const targetZ = intent.z * targetSpeed;
    const currentSpeed = Math.hypot(v.x, v.z);
    let accel;
    if (wasGrounded) accel = targetSpeed > currentSpeed ? move.groundAccel : move.groundDecel;
    else accel = intent.magnitude > 0.05 ? move.airAccel : move.airDecel;
    moveTowards2D(v, targetX, targetZ, accel * dt);

    // --- Facing turns toward the movement direction.
    if (intent.magnitude > 0.05) {
      const desired = Math.atan2(intent.x, intent.z);
      this.facing = approachAngle(this.facing, desired, move.turnSpeedDeg * (Math.PI / 180) * dt);
    }

    // --- Vertical: ground stick, coyote time, jump buffer, variable height, apex hang, fall gravity.
    if (wasGrounded) {
      this._lastGroundedTick = tick;
      if (v.y < 0) v.y = jump.groundStickVelocity;
      this._jumping = false;
    }
    const canJump = wasGrounded || (!this._jumping && tick - this._lastGroundedTick <= this._coyoteTicks);
    if (canJump && this.input.pressedWithin('jump', this._bufferTicks)) {
      const buffered = !this.input.pressed('jump');
      v.y = this._jumpVelocity;
      this._jumping = true;
      this._jumpCutApplied = false;
      this._jumpTime = 0;
      this.input.consume('jump');
      this.bus.emit(EV.PLAYER_JUMPED, { coyote: !wasGrounded, buffered });
    } else if (this._jumping) {
      this._jumpTime += dt;
    }
    const cutAllowed = this._jumpTime >= jump.minJumpTime;
    if (this._jumping && v.y > 0 && cutAllowed && !this._jumpCutApplied && !this.input.held('jump')) {
      v.y *= jump.releaseCut;
      this._jumpCutApplied = true;
    }
    let gravityScale = 1;
    if (v.y < 0) gravityScale = jump.fallGravityScale;
    else if (Math.abs(v.y) < jump.apexThreshold && this.input.held('jump'))
      gravityScale = jump.apexGravityScale;
    if (!wasGrounded || v.y > 0) v.y -= gravity * gravityScale * dt;
    if (v.y < -jump.maxFallSpeed) v.y = -jump.maxFallSpeed;

    // --- Move through Rapier and reconcile velocity with what actually happened.
    const desiredX = v.x * dt;
    const desiredZ = v.z * dt;
    const vyBefore = v.y;
    const moved = this.cc.move(desiredX, v.y * dt, desiredZ);
    const desiredLen = Math.hypot(desiredX, desiredZ);
    if (desiredLen > 1e-5) {
      const ratio = Math.hypot(moved.x, moved.z) / desiredLen;
      if (ratio < 0.98) {
        // Blocked by a wall: do not keep building speed into it.
        const keep = Math.max(0, ratio);
        v.x *= keep;
        v.z *= keep;
      }
    }
    if (this.cc.hitCeiling && v.y > 0) v.y = 0;
    this.speed = Math.hypot(v.x, v.z);

    const grounded = this.cc.grounded;
    if (grounded && !wasGrounded) {
      this.bus.emit(EV.PLAYER_LANDED, { speed: Math.max(0, -vyBefore) });
    }
    this.state = grounded ? 'ground' : 'air';

    // --- Safe ground tracking and respawn.
    if (grounded && this.cc.groundNormalY > 0.85) {
      this._safeTime += dt;
      if (this._safeTime >= this.tuning.respawn.safeGroundTime) {
        this.lastSafe.x = this.cc.position.x;
        this.lastSafe.y = this.cc.feetY;
        this.lastSafe.z = this.cc.position.z;
      }
    } else {
      this._safeTime = 0;
    }
    if (this.cc.feetY < this.tuning.respawn.killHeight) this.respawn('fell');
  }

  /**
   * Returns the character to the last safe ground (GDD: under 2 s, no death screen).
   * @param {string} reason
   */
  respawn(reason) {
    this.cc.teleport(this.lastSafe);
    this.velocity.x = this.velocity.y = this.velocity.z = 0;
    this._safeTime = 0;
    this._jumping = false;
    this.bus.emit(EV.PLAYER_RESPAWNED, { reason });
  }

  /**
   * Facing interpolated for rendering.
   * @param {number} alpha
   * @returns {number}
   */
  interpolatedFacing(alpha) {
    return this.prevFacing + wrapAngle(this.facing - this.prevFacing) * alpha;
  }
}

/**
 * Moves a 2D velocity (x, z) toward a target by at most `maxDelta`.
 * @param {{ x: number, z: number }} v
 * @param {number} tx
 * @param {number} tz
 * @param {number} maxDelta
 */
export function moveTowards2D(v, tx, tz, maxDelta) {
  const dx = tx - v.x;
  const dz = tz - v.z;
  const dist = Math.hypot(dx, dz);
  if (dist <= maxDelta || dist < 1e-6) {
    v.x = tx;
    v.z = tz;
    return;
  }
  v.x += (dx / dist) * maxDelta;
  v.z += (dz / dist) * maxDelta;
}

/**
 * Wraps an angle to [−π, π).
 * @param {number} a
 * @returns {number}
 */
export function wrapAngle(a) {
  let r = (a + Math.PI) % TWO_PI;
  if (r < 0) r += TWO_PI;
  return r - Math.PI;
}

/**
 * Rotates `current` toward `target` by at most `maxStep` along the shortest arc.
 * @param {number} current
 * @param {number} target
 * @param {number} maxStep
 * @returns {number}
 */
export function approachAngle(current, target, maxStep) {
  const delta = wrapAngle(target - current);
  if (Math.abs(delta) <= maxStep) return target;
  return current + Math.sign(delta) * maxStep;
}
