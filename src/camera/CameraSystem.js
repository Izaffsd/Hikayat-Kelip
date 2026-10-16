import { Vector3 } from 'three';
import { wrapAngle } from '../player/Traversal.js';

/**
 * Camera "brain" (Cinemachine equivalent, TECHNICAL §7). This first slice provides the FollowOrbit
 * virtual camera: orbit by mouse/gamepad/touch look, smoothed pivot, sphere-cast collision against
 * the world (fast in, slow out, never inside geometry) and auto-recentering behind Bayu.
 * Further virtual cameras (lock-on, wall-run, glide, rails) and blending build on this class.
 */
export class CameraSystem {
  /**
   * @param {object} options
   * @param {import('three').PerspectiveCamera} options.camera
   * @param {import('../physics/PhysicsWorld.js').PhysicsWorld} options.physics
   * @param {import('../core/Input.js').Input} options.input
   * @param {import('../core/Settings.js').Settings} options.settings
   * @param {object} options.tuning data/tuning/camera.json
   */
  constructor({ camera, physics, input, settings, tuning }) {
    this.camera = camera;
    this.physics = physics;
    this.input = input;
    this.settings = settings;
    this.tuning = tuning;
    const follow = tuning.follow;
    this.yaw = Math.PI;
    this.pitch = follow.defaultPitch;
    this.distance = follow.distance;
    this.currentDistance = follow.distance;
    this.pivot = new Vector3();
    this._pivotReady = false;
    this._desiredPivot = new Vector3();
    this._dir = new Vector3();
    this._look = { mouseX: 0, mouseY: 0, touchX: 0, touchY: 0 };
    this._ball = new physics.R.Ball(follow.collisionRadius);
    this._idleLook = 0;
    camera.fov = tuning.fov;
    camera.near = tuning.near;
    camera.far = tuning.far;
    camera.updateProjectionMatrix();
  }

  /**
   * Updates the camera once per rendered frame.
   * @param {number} dt real seconds
   * @param {Vector3} targetFeet interpolated player feet position
   * @param {number} targetFacing interpolated player facing yaw
   * @param {number} targetSpeed player horizontal speed (m/s)
   */
  update(dt, targetFeet, targetFacing, targetSpeed) {
    const { follow, look } = this.tuning;
    const sensitivity = this.settings.get('camera.sensitivity');
    const invert = this.settings.get('camera.invertY') ? -1 : 1;
    const l = this.input.consumeLook(this._look);
    const stick = this.input.lookStick;

    const yawInput =
      l.mouseX * look.mouseSensitivity + l.touchX * look.touchSensitivity + stick.x * look.gamepadSpeed * dt;
    const pitchInput =
      l.mouseY * look.mouseSensitivity + l.touchY * look.touchSensitivity + stick.y * look.gamepadSpeed * dt;
    this.yaw -= yawInput * sensitivity;
    this.pitch += pitchInput * sensitivity * invert;
    this.pitch = Math.min(follow.pitchMax, Math.max(follow.pitchMin, this.pitch));
    this.yaw = wrapAngle(this.yaw);

    // Auto-recenter behind the player after a moment without look input, while moving.
    const looking = Math.abs(yawInput) + Math.abs(pitchInput) > 1e-5;
    this._idleLook = looking ? 0 : this._idleLook + dt;
    if (this._recenterEnabled() && this._idleLook > follow.recenterDelay && targetSpeed > 0.5) {
      const behind = wrapAngle(targetFacing + Math.PI);
      const delta = wrapAngle(behind - this.yaw);
      const step = follow.recenterSpeed * dt * Math.min(1, targetSpeed / 4);
      this.yaw = wrapAngle(this.yaw + Math.sign(delta) * Math.min(Math.abs(delta), step));
    }

    // Pivot follows the target with exponential smoothing (frame-rate independent).
    this._desiredPivot.set(targetFeet.x, targetFeet.y + follow.pivotHeight, targetFeet.z);
    if (!this._pivotReady) {
      this.pivot.copy(this._desiredPivot);
      this._pivotReady = true;
    } else {
      const k = 1 - Math.exp(-follow.pivotLerp * dt);
      this.pivot.lerp(this._desiredPivot, k);
    }

    // Collision: sweep a sphere from the pivot toward the desired camera position.
    const cp = Math.cos(this.pitch);
    this._dir.set(Math.sin(this.yaw) * cp, Math.sin(this.pitch), Math.cos(this.yaw) * cp);
    const hitDistance = this.physics.sphereCast(
      this._ball,
      this.pivot,
      this._dir,
      this.distance + follow.collisionMargin,
    );
    const allowed = Math.max(follow.minDistance, hitDistance - follow.collisionMargin);
    if (allowed < this.currentDistance) {
      // Snap in immediately so the camera is never inside geometry, even for one frame.
      this.currentDistance = allowed;
    } else {
      this.currentDistance = Math.min(allowed, this.currentDistance + follow.pushOutSpeed * dt);
    }

    this.camera.position.copy(this.pivot).addScaledVector(this._dir, this.currentDistance);
    this.camera.lookAt(this.pivot);
  }

  /**
   * Snaps behind the player (spawn, respawn, cutscene exit).
   * @param {number} facing
   */
  snapBehind(facing) {
    this.yaw = wrapAngle(facing + Math.PI);
    this.pitch = this.tuning.follow.defaultPitch;
    this._pivotReady = false;
    this.currentDistance = this.distance;
  }

  /** Whether auto-recentering is on ('auto' = on for touch, where the GDD asks for auto-follow). */
  _recenterEnabled() {
    const setting = this.settings.get('camera.autoCamera');
    if (setting === 'auto') return this.input.device !== 'keyboard';
    return setting === true;
  }
}
