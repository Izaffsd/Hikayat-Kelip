import { DynamicDrawUsage, InstancedBufferAttribute, Sprite, SpriteNodeMaterial } from 'three/webgpu';
import {
  float,
  hash,
  instanceIndex,
  instancedBufferAttribute,
  mix,
  normalize,
  sin,
  smoothstep,
  step,
  uniform,
  uv,
  vec2,
  vec3,
} from 'three/tsl';

/**
 * The visible half of Kelip's call: a stream of firefly motes that leaves Bayu, travels about a dozen metres toward
 * the goal on a gentle arc and fades — a direction, never a waypoint arrow (GDD). One pool of sprites; each call
 * writes origin, start time and direction into instanced attributes; the motion is TSL.
 */
export class GuideTrail {
  /**
   * @param {object} [options]
   * @param {number} [options.count=54] pool (three calls in flight)
   * @param {number} [options.perCall=18]
   * @param {number} [options.life=2.4] seconds
   * @param {number} [options.distance=12] metres travelled
   */
  constructor({ count = 54, perCall = 18, life = 2.4, distance = 12 } = {}) {
    this.count = count;
    this.perCall = perCall;
    this._next = 0;
    this.origins = new Float32Array(count * 4);
    this.dirs = new Float32Array(count * 4);
    for (let i = 0; i < count; i++) this.origins[i * 4 + 3] = -1e4;
    this.originAttribute = new InstancedBufferAttribute(this.origins, 4);
    this.dirAttribute = new InstancedBufferAttribute(this.dirs, 4);
    this.originAttribute.setUsage(DynamicDrawUsage);
    this.dirAttribute.setUsage(DynamicDrawUsage);
    this.now = uniform(0);
    const o = instancedBufferAttribute(this.originAttribute);
    const d = instancedBufferAttribute(this.dirAttribute);
    const age = this.now.sub(o.w);
    const t = age.div(life).clamp(0, 1);
    const alive = step(0, age).mul(step(age, life));
    const id = float(instanceIndex);
    const dir = normalize(vec3(d.x, 0, d.z));
    const side = vec3(dir.z.negate(), 0, dir.x);
    const travel = smoothstep(0, 1, t).mul(distance).mul(d.w);
    const arc = sin(t.mul(Math.PI)).mul(0.7).add(1.3);
    const sway = sin(age.mul(4).add(id.mul(2.1)))
      .mul(0.35)
      .mul(t);
    const jitter = vec3(
      hash(id.add(3.1)).sub(0.5),
      hash(id.add(5.3)).sub(0.5),
      hash(id.add(9.7)).sub(0.5),
    ).mul(0.5);
    const material = new SpriteNodeMaterial({ transparent: true, depthWrite: false });
    material.positionNode = o.xyz
      .add(dir.mul(travel))
      .add(vec3(0, arc, 0))
      .add(side.mul(sway))
      .add(jitter);
    const disc = float(1).sub(uv().sub(0.5).length().mul(2)).clamp(0, 1);
    const fade = smoothstep(0, 0.1, t).mul(float(1).sub(smoothstep(0.7, 1, t)));
    const blink = sin(age.mul(9).add(id)).mul(0.25).add(0.75);
    material.colorNode = mix(vec3(0.78, 1.0, 0.35), vec3(1, 0.95, 0.55), hash(id))
      .mul(2.4)
      .mul(blink);
    material.opacityNode = fade.mul(alive).mul(disc.pow(1.4));
    material.scaleNode = vec2(0.09);
    material.fog = false;
    this.mesh = new Sprite(material);
    this.mesh.count = count;
    this.mesh.frustumCulled = false;
    this.mesh.name = 'GuideTrail';
  }

  /**
   * Sends a stream from `origin` toward `target`.
   * @param {{ x: number, y: number, z: number }} origin
   * @param {{ x: number, y: number, z: number }} target
   */
  call(origin, target) {
    const dx = target.x - origin.x;
    const dz = target.z - origin.z;
    const len = Math.hypot(dx, dz) || 1;
    // Never overshoot a close goal.
    const reach = Math.min(1, len / 12);
    const now = this.now.value;
    for (let k = 0; k < this.perCall; k++) {
      const i = this._next;
      this._next = (this._next + 1) % this.count;
      this.origins.set([origin.x, origin.y, origin.z, now + k * 0.06], i * 4);
      this.dirs.set([dx / len, 0, dz / len, reach], i * 4);
    }
    this.originAttribute.needsUpdate = true;
    this.dirAttribute.needsUpdate = true;
  }

  /**
   * @param {number} seconds real clock
   */
  update(seconds) {
    this.now.value = seconds;
  }

  dispose() {
    this.mesh.removeFromParent();
    this.mesh.material.dispose();
  }
}
