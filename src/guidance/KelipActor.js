import { Vector3 } from 'three/webgpu';

/**
 * Kelip, the last firefly spirit (GDD Characters): it rises out of Tok Wan's hikayat in a spiral of light (5:00),
 * then floats beside Bayu's shoulder, bobbing and blinking, its glow lighting the way (a moving lamp in the lamp
 * pool). When called it darts toward the goal and comes back. Procedural, no skeleton (TECHNICAL §5.4).
 */
export class KelipActor {
  /**
   * @param {object} options
   * @param {{ scene: import('three').Object3D }} options.gltf characters/kelip
   * @param {import('three').Object3D} options.parent
   * @param {{ addLamp(lamp: object): object }} options.dayNight
   */
  constructor({ gltf, parent, dayNight }) {
    this.object = gltf.scene.clone(true);
    this.object.name = 'Kelip';
    this.object.visible = false;
    this.object.traverse((node) => {
      if (node.isMesh) node.frustumCulled = false;
    });
    parent.add(this.object);
    this.lamp = dayNight.addLamp({ position: new Vector3(), kind: 'kelip', intensity: 0 });
    this.position = new Vector3();
    this._velocity = new Vector3();
    this._target = new Vector3();
    this._rise = null;
    this._dart = null;
    this.visible = false;
  }

  /**
   * Shows or hides Kelip (story flag `kelip_awake`).
   * @param {boolean} visible
   * @param {{ x: number, y: number, z: number }} [at] where it appears
   */
  setVisible(visible, at) {
    this.visible = visible;
    this.object.visible = visible;
    this.lamp.intensity = visible ? 1 : 0;
    if (visible && at) this.position.set(at.x, at.y, at.z);
  }

  /**
   * The awakening: a spiral up out of the hikayat.
   * @param {{ x: number, y: number, z: number }} from
   * @param {number} seconds
   */
  rise(from, seconds) {
    this.setVisible(true, from);
    this._rise = { x: from.x, y: from.y, z: from.z, t: 0, seconds };
  }

  /**
   * Darts toward a point and back (Kelip's call).
   * @param {{ x: number, y: number, z: number }} target
   */
  dart(target) {
    if (!this.visible) return;
    this._dart = { x: target.x, y: target.y, z: target.z, t: 0 };
  }

  /**
   * @param {number} dt
   * @param {{ x: number, y: number, z: number }} feet Bayu
   * @param {number} facing Bayu's yaw
   * @param {number} now seconds
   */
  update(dt, feet, facing, now) {
    if (!this.visible) return;
    const p = this.position;
    if (this._rise) {
      const r = this._rise;
      r.t += dt;
      const u = Math.min(1, r.t / r.seconds);
      const angle = u * Math.PI * 5;
      const radius = 0.25 + u * 0.5;
      p.set(r.x + Math.cos(angle) * radius, r.y + u * 2.2, r.z + Math.sin(angle) * radius);
      if (u >= 1) this._rise = null;
    } else {
      // Beside Bayu's right shoulder, a little behind.
      const s = Math.sin(facing);
      const c = Math.cos(facing);
      this._target.set(feet.x - c * 0.75 - s * 0.45, feet.y + 1.85, feet.z + s * 0.75 - c * 0.45);
      if (this._dart) {
        const d = this._dart;
        d.t += dt;
        const out = d.t < 0.5 ? d.t / 0.5 : Math.max(0, 1 - (d.t - 0.5) / 0.7);
        const dx = d.x - feet.x;
        const dz = d.z - feet.z;
        const len = Math.hypot(dx, dz) || 1;
        this._target.x += (dx / len) * 5 * out;
        this._target.z += (dz / len) * 5 * out;
        this._target.y += out * 0.8;
        if (d.t > 1.2) this._dart = null;
      }
      // Critically damped follow.
      const k = 1 - Math.exp(-6 * dt);
      p.lerp(this._target, k);
    }
    this.object.position.set(p.x, p.y + Math.sin(now * 2.2) * 0.07, p.z);
    this.object.rotation.y = now * 0.6;
    this.lamp.position.copy(this.object.position);
  }

  dispose() {
    this.object.removeFromParent();
  }
}
