import { AdditiveBlending, Sprite, SpriteNodeMaterial } from 'three/webgpu';
import {
  cameraPosition,
  distance,
  float,
  hash,
  instanceIndex,
  mod,
  smoothstep,
  time,
  uniform,
  vec2,
  vec3,
} from 'three/tsl';

/**
 * Storm rain (TECHNICAL §4.3): a box of falling streaks around the camera, animated entirely in the vertex stage
 * (no per-frame CPU work). Wind slants the streaks; `intensity` scales opacity so rain can build up or stop.
 */
export class Rain {
  /**
   * @param {object} [options]
   * @param {number} [options.count=1800]
   * @param {number} [options.radius=22] horizontal half-size of the rain box (m)
   * @param {number} [options.height=18]
   */
  constructor({ count = 1800, radius = 22, height = 18 } = {}) {
    this.intensity = uniform(1);
    this.wind = uniform(vec2(2.5, 1.2));
    const material = new SpriteNodeMaterial({
      transparent: true,
      depthWrite: false,
      blending: AdditiveBlending,
    });
    const id = float(instanceIndex);
    const rx = hash(id.add(0.13))
      .sub(0.5)
      .mul(radius * 2);
    const rz = hash(id.add(7.31))
      .sub(0.5)
      .mul(radius * 2);
    const ry = hash(id.add(3.77));
    const speed = float(16).add(hash(id.add(1.9)).mul(6));
    const fall = mod(time.mul(speed).add(ry.mul(height)), height);
    const drift = fall.div(speed); // seconds since this streak entered the box
    const position = vec3(
      cameraPosition.x.add(rx).add(this.wind.x.mul(drift)),
      cameraPosition.y.add(height * 0.55).sub(fall),
      cameraPosition.z.add(rz).add(this.wind.y.mul(drift)),
    );
    material.positionNode = position;
    material.scaleNode = vec2(0.012, 0.38);
    material.colorNode = vec3(0.6, 0.68, 0.8);
    // Streaks right in front of the lens would be huge bars: fade them out within a few metres.
    const near = smoothstep(2.0, 6.0, distance(position, cameraPosition));
    material.opacityNode = this.intensity.mul(0.22).mul(near);
    material.fog = false;
    this.mesh = new Sprite(material);
    this.mesh.count = count;
    this.mesh.frustumCulled = false;
    this.mesh.name = 'Rain';
  }

  dispose() {
    this.mesh.removeFromParent();
    this.mesh.material.dispose();
  }
}
