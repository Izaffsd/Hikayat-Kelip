import { BackSide, Color, Mesh, MeshBasicNodeMaterial, SphereGeometry, Vector3 } from 'three/webgpu';
import {
  dot,
  float,
  max,
  mix,
  mx_fractal_noise_float,
  mx_noise_float,
  normalize,
  positionLocal,
  pow,
  smoothstep,
  time,
  uniform,
  vec3,
} from 'three/tsl';

/**
 * Sky dome (TECHNICAL §3.2 SkyMaterial): horizon-to-zenith gradient, moon with halo, twinkling stars, drifting
 * storm clouds and lightning flashes. Follows the camera so it is always "at infinity"; drawn first, no depth write.
 */
export class Sky {
  constructor() {
    this.uniforms = {
      horizon: uniform(new Color(0x2a3554)),
      zenith: uniform(new Color(0x070b18)),
      moonDir: uniform(new Vector3(0.3, 0.6, -0.7).normalize()),
      moonColor: uniform(new Color(0xe8eeff)),
      moonSize: uniform(0.9993),
      stars: uniform(1),
      clouds: uniform(0),
      cloudColor: uniform(new Color(0x1a2034)),
      flash: uniform(0),
      sunGlow: uniform(new Color(0x000000)),
      sunDir: uniform(new Vector3(-0.8, 0.05, 0.4).normalize()),
    };
    const u = this.uniforms;
    const material = new MeshBasicNodeMaterial({ side: BackSide, depthWrite: false, fog: false });
    const dir = normalize(positionLocal);
    const up = max(dir.y, 0);
    let c = mix(u.horizon, u.zenith, pow(up, 0.55));
    // Warm glow around the setting sun (dusk), fading upward.
    c = c.add(u.sunGlow.mul(pow(max(dot(dir, u.sunDir), 0), 6)).mul(float(1).sub(up)));
    // Stars: sparse bright cells of high-frequency noise, twinkling; hidden by clouds and near the horizon.
    const starField = smoothstep(0.72, 0.8, mx_noise_float(dir.mul(260)));
    const twinkle = mx_noise_float(dir.mul(90).add(time.mul(0.6)))
      .mul(0.5)
      .add(0.5);
    c = c.add(
      vec3(
        starField
          .mul(twinkle)
          .mul(u.stars)
          .mul(smoothstep(0.05, 0.3, up))
          .mul(0.9),
      ),
    );
    // Moon disc and halo.
    const moonDot = dot(dir, u.moonDir);
    const disc = smoothstep(u.moonSize, u.moonSize.add(0.0004), moonDot);
    const halo = pow(max(moonDot, 0), 64).mul(0.35);
    c = c.add(u.moonColor.mul(disc.add(halo)));
    // Storm clouds drift and cover the moon and stars.
    const cloudNoise = mx_fractal_noise_float(
      dir.mul(3).add(vec3(time.mul(0.03), 0, time.mul(0.01))),
      4,
      2,
      0.5,
    );
    const cover = smoothstep(0.0, 0.6, cloudNoise.add(u.clouds.sub(0.5))).mul(u.clouds);
    c = mix(c, u.cloudColor, cover.mul(0.9));
    // Lightning lights the cloud bellies.
    c = c.add(vec3(0.75, 0.8, 1.0).mul(u.flash).mul(cover.mul(0.8).add(0.25)));
    material.colorNode = c;
    this.mesh = new Mesh(new SphereGeometry(450, 32, 16), material);
    this.mesh.name = 'Sky';
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = -10;
  }

  /**
   * Keeps the dome centred on the camera.
   * @param {import('three').Camera} camera
   */
  follow(camera) {
    this.mesh.position.copy(camera.position);
  }

  dispose() {
    this.mesh.removeFromParent();
    this.mesh.geometry.dispose();
    this.mesh.material.dispose();
  }
}
