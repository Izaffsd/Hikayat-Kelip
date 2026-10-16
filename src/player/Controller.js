/**
 * Turns raw input into a world-space movement intent relative to the camera.
 * Camera convention: the camera orbits at yaw θ, so its forward on the ground plane is (−sin θ, −cos θ)
 * and its right is (cos θ, −sin θ).
 */
export class PlayerController {
  /**
   * @param {import('../core/Input.js').Input} input
   */
  constructor(input) {
    this.input = input;
    this._move = { x: 0, y: 0 };
    /** World-space intent: unit direction (x, z), stick magnitude 0..1, sprint button held. */
    this.intent = { x: 0, z: 0, magnitude: 0, sprintHeld: false };
  }

  /**
   * Updates `intent` from input and the camera yaw. Call once per fixed tick.
   * @param {number} cameraYaw radians
   * @returns {{ x: number, z: number, magnitude: number, sprintHeld: boolean }}
   */
  update(cameraYaw) {
    const move = this.input.getMove(this._move);
    const magnitude = Math.min(1, Math.hypot(move.x, move.y));
    const intent = this.intent;
    intent.magnitude = magnitude;
    intent.sprintHeld = this.input.held('sprint');
    if (magnitude < 1e-4) {
      intent.x = 0;
      intent.z = 0;
      return intent;
    }
    const sin = Math.sin(cameraYaw);
    const cos = Math.cos(cameraYaw);
    const wx = cos * move.x - sin * move.y;
    const wz = -sin * move.x - cos * move.y;
    const len = Math.hypot(wx, wz) || 1;
    intent.x = wx / len;
    intent.z = wz / len;
    return intent;
  }
}
