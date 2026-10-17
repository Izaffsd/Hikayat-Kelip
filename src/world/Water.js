import { Color, Mesh, MeshBasicNodeMaterial, PlaneGeometry, Vector3 } from 'three/webgpu';
import {
  cameraPosition,
  distance,
  dot,
  float,
  max,
  mix,
  mx_noise_float,
  normalize,
  positionWorld,
  pow,
  reflect,
  smoothstep,
  time,
  uniform,
  vec2,
  vec3,
} from 'three/tsl';

/**
 * River and sea surface (TECHNICAL §3.2 WaterMaterial): unlit and cheap, so it looks the same on both backends and on
 * phones. Depth colour from indigo to the sky tint by Fresnel, moving ripples from two noise layers (more and faster
 * in the storm), moon glints from the rippled normal, and rain rings when it rains. The level can move (tide, flood).
 */
export class Water {
  /**
   * @param {object} def region.water: { level, size, center? }
   */
  constructor(def) {
    this.level = def.level;
    this.uniforms = {
      deep: uniform(new Color(0x0a1426)),
      shallow: uniform(new Color(0x1d3550)),
      sky: uniform(new Color(0x3a4e78)),
      moonDir: uniform(new Vector3(0.3, 0.6, -0.7).normalize()),
      moonColor: uniform(new Color(0xdfe6ff)),
      glint: uniform(1),
      choppiness: uniform(1),
      rain: uniform(0),
      colourDrain: uniform(0),
    };
    const size = def.size ?? 800;
    const geometry = new PlaneGeometry(size, size, 1, 1).rotateX(-Math.PI / 2);
    this.mesh = new Mesh(geometry, this._material());
    this.mesh.name = 'Water';
    this.mesh.position.set(def.center?.[0] ?? 0, this.level, def.center?.[1] ?? 0);
    this.mesh.renderOrder = -1;
  }

  _material() {
    const u = this.uniforms;
    const material = new MeshBasicNodeMaterial();
    const p = positionWorld;
    const t = time.mul(u.choppiness);
    const uvA = vec2(p.x, p.z)
      .mul(0.35)
      .add(vec2(t.mul(0.12), t.mul(0.05)));
    const uvB = vec2(p.x, p.z)
      .mul(0.9)
      .sub(vec2(t.mul(0.07), t.mul(0.16)));
    const nA = mx_noise_float(uvA);
    const nB = mx_noise_float(uvB);
    const rainRings = mx_noise_float(vec2(p.x, p.z).mul(6).add(time.mul(3))).mul(u.rain);
    const slope = vec2(nA.mul(0.6).add(nB.mul(0.4)), nB.mul(0.6).sub(nA.mul(0.3)))
      .mul(u.choppiness.mul(0.35))
      .add(rainRings.mul(0.15));
    const normal = normalize(vec3(slope.x, 1, slope.y));
    const view = normalize(cameraPosition.sub(p));
    const fresnel = pow(float(1).sub(max(dot(normal, view), 0)), 4);
    // Moon path: a broad lobe around the flat-water mirror direction (wider when the water is choppy), broken into
    // small sparkles by fine, fast noise. Glints from the low-frequency ripple normal would form foam-like blobs.
    // Sparkles fade to their average with distance so the horizon does not shimmer.
    const mirror = reflect(view.negate(), vec3(0, 1, 0));
    const path = pow(max(dot(mirror, u.moonDir), 0), float(40).div(u.choppiness.add(0.25)));
    const fine = mx_noise_float(vec3(p.x.mul(4.5), p.z.mul(4.5), time.mul(1.2)));
    const far = smoothstep(25, 70, distance(p, cameraPosition));
    const sparkle = mix(smoothstep(0.3, 0.55, fine), float(0.15), far);
    const glint = path.mul(sparkle).mul(u.glint);
    let c = mix(u.deep, u.shallow, nA.mul(0.5).add(0.5).mul(0.35));
    c = mix(c, u.sky, fresnel.mul(0.85));
    c = c.add(u.moonColor.mul(glint.mul(1.6)));
    const grey = dot(c, vec3(0.299, 0.587, 0.114));
    material.colorNode = mix(c, vec3(grey), u.colourDrain);
    return material;
  }

  /**
   * @param {number} level
   */
  setLevel(level) {
    this.level = level;
    this.mesh.position.y = level;
  }

  dispose() {
    this.mesh.removeFromParent();
    this.mesh.geometry.dispose();
    this.mesh.material.dispose();
  }
}
