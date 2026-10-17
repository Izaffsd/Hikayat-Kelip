import { CylinderGeometry, Float32BufferAttribute, Mesh, MeshBasicNodeMaterial } from 'three/webgpu';
import {
  attribute,
  cameraPosition,
  cos,
  dot,
  float,
  max,
  mix,
  normalWorld,
  normalize,
  positionLocal,
  positionWorld,
  pow,
  sin,
  time,
  uniform,
  vec3,
  vec4,
} from 'three/tsl';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

/**
 * Kelam's tendrils (GDD 7:00: "Kelam's tendrils rise from the water"): ink-dark tapering tentacles that sway like
 * weed in a current, with a cold violet rim (CULTURE.md: ink-like, colour-draining, never gore). One merged mesh, one
 * draw call; each tendril keeps its base, height and a delay in vertex attributes, so they rise one after another
 * from a single uniform. `rise(seconds)` / `sink(seconds)` animate it.
 */
export class Tendrils {
  /**
   * @param {Array<{ x: number, y: number, z: number }>} bases where each tendril leaves the water
   * @param {object} [options]
   * @param {number} [options.height=3.4]
   * @param {number} [options.radius=0.2]
   * @param {number} [options.seed=11]
   */
  constructor(bases, { height = 3.4, radius = 0.2, seed = 11 } = {}) {
    let state = seed;
    const random = () => {
      state = (state * 16807) % 2147483647;
      return (state - 1) / 2147483646;
    };
    const parts = bases.map((p, i) => {
      const h = height * (0.75 + random() * 0.5);
      const g = new CylinderGeometry(0.03, radius * (0.8 + random() * 0.4), h, 7, 18, true);
      g.translate(p.x, p.y + h / 2, p.z);
      const n = g.attributes.position.count;
      const base = new Float32Array(n * 3);
      const info = new Float32Array(n * 3);
      for (let k = 0; k < n; k++) {
        base.set([p.x, p.y, p.z], k * 3);
        info.set([random() * 6.28, h, (i / Math.max(1, bases.length)) * 0.6], k * 3);
      }
      g.setAttribute('aBase', new Float32BufferAttribute(base, 3));
      g.setAttribute('aInfo', new Float32BufferAttribute(info, 3));
      return g;
    });
    this.geometry = mergeGeometries(parts);
    for (const g of parts) g.dispose();
    this.amount = uniform(0);
    const base = attribute('aBase', 'vec3');
    const info = attribute('aInfo', 'vec3');
    const local = positionLocal.sub(base);
    const along = local.y.div(info.y).clamp(0, 1);
    // Staggered: each tendril starts after its delay and takes the rest of the rise.
    const grown = this.amount.mul(1.6).sub(info.z).clamp(0, 1);
    const bend = along.mul(along);
    const sway = vec3(
      sin(time.mul(1.1).add(along.mul(3.2)).add(info.x)).mul(0.55),
      0,
      cos(time.mul(0.9).add(along.mul(2.6)).add(info.x.mul(1.3))).mul(0.45),
    ).mul(bend);
    const material = new MeshBasicNodeMaterial({ transparent: false });
    material.positionNode = base.add(vec3(local.x, local.y.mul(grown), local.z)).add(sway.mul(grown));
    const view = normalize(cameraPosition.sub(positionWorld));
    const rim = pow(float(1).sub(max(dot(normalWorld, view), 0)), 3);
    const pulse = sin(time.mul(2.2).add(info.x)).mul(0.2).add(0.8);
    const ink = vec3(0.02, 0.015, 0.04);
    material.colorNode = vec4(mix(ink, vec3(0.38, 0.14, 0.62), rim.mul(0.75).mul(pulse)), 1);
    material.fog = true;
    this.material = material;
    this.mesh = new Mesh(this.geometry, material);
    this.mesh.name = 'KelamTendrils';
    this.mesh.frustumCulled = false;
    this.mesh.visible = false;
    this._anim = null;
  }

  /**
   * Rises from the water over `seconds` (0 = at once).
   * @param {number} seconds
   */
  rise(seconds) {
    this._to(1, seconds);
  }

  /**
   * Sinks back over `seconds` (0 = at once).
   * @param {number} seconds
   */
  sink(seconds) {
    this._to(0, seconds);
  }

  /**
   * @param {number} dt seconds
   */
  update(dt) {
    const a = this._anim;
    if (!a) return;
    a.t = Math.min(1, a.t + dt / a.seconds);
    const u = a.t * a.t * (3 - 2 * a.t);
    this.amount.value = a.from + (a.to - a.from) * u;
    if (a.t >= 1) {
      this._anim = null;
      if (a.to === 0) this.mesh.visible = false;
    }
  }

  dispose() {
    this.mesh.removeFromParent();
    this.geometry.dispose();
    this.material.dispose();
  }

  _to(value, seconds) {
    if (value > 0) this.mesh.visible = true;
    if (seconds <= 0) {
      this.amount.value = value;
      this._anim = null;
      if (value === 0) this.mesh.visible = false;
      return;
    }
    this._anim = { from: this.amount.value, to: value, t: 0, seconds };
  }
}
