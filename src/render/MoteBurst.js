import { DynamicDrawUsage, InstancedBufferAttribute, Sprite, SpriteNodeMaterial } from 'three/webgpu';
import {
  float,
  hash,
  instanceIndex,
  instancedBufferAttribute,
  mix,
  sin,
  smoothstep,
  step,
  uniform,
  uv,
  vec2,
  vec3,
} from 'three/tsl';

/**
 * Dark motes that rise and turn into fireflies when a shadow wisp dissolves (TECHNICAL §6.3: wisps "dissolve into
 * dark motes that become fireflies — never blood, never bodies"). One fixed pool of sprites; a burst claims the next
 * block and writes its origin and birth time into an instanced attribute. Everything else runs in TSL.
 */
export class MoteBurst {
  /**
   * @param {object} [options]
   * @param {number} [options.count=120] pool size
   * @param {number} [options.perBurst=24]
   * @param {number} [options.life=1.8] seconds
   */
  constructor({ count = 120, perBurst = 24, life = 1.8 } = {}) {
    this.count = count;
    this.perBurst = perBurst;
    this.life = life;
    this._next = 0;
    this.data = new Float32Array(count * 4);
    for (let i = 0; i < count; i++) this.data[i * 4 + 3] = -1e4;
    this.attribute = new InstancedBufferAttribute(this.data, 4);
    this.attribute.setUsage(DynamicDrawUsage);
    this.now = uniform(0);
    const a = instancedBufferAttribute(this.attribute);
    const age = this.now.sub(a.w);
    const t = age.div(life).clamp(0, 1);
    const alive = step(0, age).mul(step(age, life));
    const id = float(instanceIndex);
    const spread = vec3(
      hash(id.add(1.3)).sub(0.5),
      hash(id.add(7.1)).mul(0.5).add(0.2),
      hash(id.add(3.7)).sub(0.5),
    );
    const rise = vec3(0, t.mul(t).mul(1.4), 0);
    const wobble = vec3(sin(age.mul(5).add(id)).mul(0.08), 0, sin(age.mul(4.3).add(id.mul(1.7))).mul(0.08));
    const material = new SpriteNodeMaterial({ transparent: true, depthWrite: false });
    material.positionNode = a.xyz
      .add(spread.mul(t.sqrt().mul(1.5)))
      .add(rise)
      .add(wobble);
    const glow = smoothstep(0.3, 0.65, t);
    material.colorNode = mix(vec3(0.07, 0.04, 0.11), vec3(0.78, 1.0, 0.35).mul(2.2), glow);
    const disc = float(1).sub(uv().sub(0.5).length().mul(2)).clamp(0, 1);
    const fade = smoothstep(0, 0.08, t).mul(float(1).sub(smoothstep(0.75, 1, t)));
    material.opacityNode = fade.mul(alive).mul(disc.pow(1.5));
    material.scaleNode = vec2(mix(0.07, 0.1, glow));
    material.fog = false;
    this.mesh = new Sprite(material);
    this.mesh.count = count;
    this.mesh.frustumCulled = false;
    this.mesh.name = 'MoteBurst';
  }

  /**
   * Releases a burst at a point.
   * @param {number} x
   * @param {number} y
   * @param {number} z
   */
  burst(x, y, z) {
    const now = this.now.value;
    for (let k = 0; k < this.perBurst; k++) {
      const i = this._next;
      this._next = (this._next + 1) % this.count;
      this.data[i * 4] = x;
      this.data[i * 4 + 1] = y;
      this.data[i * 4 + 2] = z;
      this.data[i * 4 + 3] = now + k * 0.012;
    }
    this.attribute.needsUpdate = true;
  }

  /**
   * @param {number} seconds clock for the bursts (real time)
   */
  update(seconds) {
    this.now.value = seconds;
  }

  dispose() {
    this.mesh.removeFromParent();
    this.mesh.material.dispose();
  }
}
