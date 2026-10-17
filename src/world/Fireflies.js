import {
  AdditiveBlending,
  InstancedBufferAttribute,
  Sprite,
  SpriteNodeMaterial,
  Vector3,
} from 'three/webgpu';
import {
  abs,
  cos,
  dot,
  exp,
  float,
  instancedBufferAttribute,
  max,
  pow,
  sin,
  smoothstep,
  time,
  uniform,
  uv,
  vec2,
  vec3,
} from 'three/tsl';

/**
 * Kelip-kelip (TECHNICAL §3.4): the game's signature effect. Every firefly is a GPU-animated sprite drifting around
 * an anchor on a berembang tree; each group blinks in synchrony like the real Kuala Selangor colonies (pattern
 * `sync`) or twinkles freely (`free`). Three uniforms drive the story moments:
 * - `wave*`: Kelip's call — a bright synchronized wave that travels from the player toward the objective;
 * - `darkFront` / `darkDir`: the display going dark row by row (Chapter 1, 7:00);
 * - `brightness`: global level (chapter progress, Kelam drain).
 * Positions are evaluated analytically per frame, so there is no simulation state and both backends behave alike.
 */
export class Fireflies {
  /**
   * @param {object} options
   * @param {Array<{ center: number[], radius: number, height?: number, weight?: number, sync?: boolean }>} options.groups
   * @param {number} options.count total fireflies (quality preset)
   * @param {number} [options.seed=7]
   */
  constructor({ groups, count, seed = 7 }) {
    const totalWeight = groups.reduce((s, g) => s + (g.weight ?? 1), 0) || 1;
    const anchors = new Float32Array(count * 4);
    const params = new Float32Array(count * 4);
    let random = seed;
    const rand = () => {
      random = (random * 16807) % 2147483647;
      return (random - 1) / 2147483646;
    };
    let index = 0;
    groups.forEach((group, g) => {
      const n =
        g === groups.length - 1 ? count - index : Math.round((count * (group.weight ?? 1)) / totalWeight);
      for (let k = 0; k < n && index < count; k++, index++) {
        // Clustered in the crown and spilling below it: a dense core with a sparse halo (no boxy outline).
        const a = rand() * Math.PI * 2;
        const halo = rand() < 0.25;
        const r = (halo ? 1 + rand() * 0.8 : Math.sqrt(rand())) * group.radius;
        const h = (group.height ?? 1.5) * (halo ? rand() * 1.6 - 1.2 : rand() - 0.3);
        anchors[index * 4] = group.center[0] + Math.cos(a) * r;
        anchors[index * 4 + 1] = group.center[1] + h;
        anchors[index * 4 + 2] = group.center[2] + Math.sin(a) * r;
        anchors[index * 4 + 3] = rand() * 6.283; // individual phase
        params[index * 4] = group.sync === false ? 0 : 1; // synchronized group
        params[index * 4 + 1] = g * 0.37; // group phase offset
        params[index * 4 + 2] = 0.7 + rand() * 0.6; // size
        params[index * 4 + 3] = rand(); // drift seed
      }
    });
    this.count = index;
    this.uniforms = {
      brightness: uniform(1),
      waveOrigin: uniform(new Vector3()),
      waveDir: uniform(new Vector3(0, 0, 1)),
      waveAge: uniform(100),
      waveSpeed: uniform(14),
      darkFront: uniform(1e6),
      darkDir: uniform(new Vector3(1, 0, 0)),
      highContrast: uniform(0),
    };
    const u = this.uniforms;
    const anchor = instancedBufferAttribute(new InstancedBufferAttribute(anchors, 4));
    const param = instancedBufferAttribute(new InstancedBufferAttribute(params, 4));
    const material = new SpriteNodeMaterial({
      transparent: true,
      depthWrite: false,
      blending: AdditiveBlending,
    });
    const phase = anchor.w;
    const t = time;
    const drift = vec3(
      sin(t.mul(0.37).add(phase))
        .mul(0.45)
        .add(sin(t.mul(0.91).add(phase.mul(2.1))).mul(0.15)),
      sin(t.mul(0.53).add(phase.mul(1.7))).mul(0.25),
      cos(t.mul(0.41).add(phase.mul(1.3))).mul(0.45),
    );
    const position = anchor.xyz.add(drift);
    material.positionNode = position;
    // Blink: synchronized groups flash together (sharp peaks every ~1.6 s); free ones twinkle on their own phase.
    const syncBlink = pow(max(sin(t.mul(3.9).add(param.y)), 0), 10);
    const freeBlink = pow(max(sin(t.mul(2.3).add(phase.mul(3))), 0), 6);
    const blink = syncBlink.mul(param.x).add(freeBlink.mul(float(1).sub(param.x)));
    const base = float(0.18).add(blink.mul(0.82));
    // Kelip's call: a wave front travelling from the origin along waveDir.
    const along = dot(position.sub(u.waveOrigin), u.waveDir);
    const front = u.waveAge.mul(u.waveSpeed);
    const wave = exp(abs(along.sub(front)).mul(-0.9))
      .mul(smoothstep(-2, 0.5, along))
      .mul(float(1).sub(smoothstep(4, 7, u.waveAge)));
    // Display going dark row by row past the front.
    const lit = float(1).sub(smoothstep(-1.5, 1.5, dot(position, u.darkDir).sub(u.darkFront)));
    const glow = base.add(wave.mul(2.5)).mul(lit).mul(u.brightness);
    const tint = vec3(0.78, 1.0, 0.35)
      .mul(float(1).sub(u.highContrast))
      .add(vec3(1.0, 0.95, 0.4).mul(u.highContrast));
    material.colorNode = tint.mul(glow.mul(2.2));
    // Sprites are quads: a round core fading to the edge, so close fireflies never show as squares.
    const r = uv().sub(0.5).length().mul(2);
    const disc = pow(max(float(1).sub(r), 0), 1.8);
    material.opacityNode = glow.min(1).mul(disc);
    material.scaleNode = vec2(param.z.mul(0.1).mul(float(1).add(wave.mul(0.8))));
    material.fog = false;
    this.mesh = new Sprite(material);
    this.mesh.count = this.count;
    this.mesh.frustumCulled = false;
    this.mesh.name = 'Fireflies';
  }

  /**
   * Starts Kelip's guide wave from `origin` toward `target`.
   * @param {Vector3} origin
   * @param {Vector3} target
   */
  wave(origin, target) {
    const u = this.uniforms;
    u.waveOrigin.value.copy(origin);
    u.waveDir.value.copy(target).sub(origin).setY(0).normalize();
    u.waveAge.value = 0;
  }

  /**
   * Advances story-driven effects (the guide wave).
   * @param {number} dt
   */
  update(dt) {
    if (this.uniforms.waveAge.value < 100) this.uniforms.waveAge.value += dt;
  }

  dispose() {
    this.mesh.removeFromParent();
    this.mesh.material.dispose();
  }
}
