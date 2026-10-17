import { Mesh, MeshStandardNodeMaterial, PlaneGeometry } from 'three/webgpu';
import { color, float, mix, mx_noise_float, positionWorld, smoothstep, uniform, vec2 } from 'three/tsl';
import { GROUP, interactionGroups } from '../physics/PhysicsWorld.js';

/**
 * Deterministic 2D value noise in [0, 1) (layout-independent, no Math.random).
 * @param {number} x
 * @param {number} z
 * @param {number} seed
 * @returns {number}
 */
export function valueNoise(x, z, seed = 0) {
  const xi = Math.floor(x);
  const zi = Math.floor(z);
  const xf = x - xi;
  const zf = z - zi;
  const h = (i, j) => {
    const n = Math.sin((xi + i) * 127.1 + (zi + j) * 311.7 + seed * 74.7) * 43758.5453;
    return n - Math.floor(n);
  };
  const u = xf * xf * (3 - 2 * xf);
  const v = zf * zf * (3 - 2 * zf);
  return (h(0, 0) * (1 - u) + h(1, 0) * u) * (1 - v) + (h(0, 1) * (1 - u) + h(1, 1) * u) * v;
}

/**
 * Height of the terrain described by a region: a mudflat at `base` with island mounds (rotated ellipses whose cores
 * reach `h`) and a little noise.
 * @param {object} def region.terrain
 * @param {number} x
 * @param {number} z
 * @returns {number}
 */
export function terrainHeight(def, x, z) {
  let height = def.base;
  for (const island of def.islands) {
    const angle = ((island.rot ?? 0) * Math.PI) / 180;
    const dx = x - island.x;
    const dz = z - island.z;
    const lx = (dx * Math.cos(angle) + dz * Math.sin(angle)) / island.rx;
    const lz = (-dx * Math.sin(angle) + dz * Math.cos(angle)) / island.rz;
    const d = Math.hypot(lx, lz);
    const t = d >= 1 ? 0 : d <= 0.55 ? 1 : 1 - smooth01((d - 0.55) / 0.45);
    height = Math.max(height, def.base + (island.h - def.base) * t);
  }
  const bumps = (valueNoise(x * 0.18, z * 0.18, def.seed ?? 1) - 0.5) * (def.noise ?? 0.1);
  return height + bumps;
}

function smooth01(t) {
  return t * t * (3 - 2 * t);
}

/**
 * Terrain mesh and collider (mangrove mudflats and the village bank). The mesh colour comes from height: wet dark
 * mud near the water, drier earth and grass tufts higher up, with painterly noise; the collider is a trimesh of the
 * same grid.
 */
export class Terrain {
  /**
   * @param {object} def region.terrain: { center: [x, z], size: [w, d], res: n, base, islands: [...], seed, noise }
   * @param {import('../physics/PhysicsWorld.js').PhysicsWorld} physics
   * @param {number} waterLevel
   */
  constructor(def, physics, waterLevel) {
    const [w, d] = def.size;
    const res = def.res ?? 128;
    const geometry = new PlaneGeometry(w, d, res, res).rotateX(-Math.PI / 2);
    geometry.translate(def.center[0], 0, def.center[1]);
    const position = geometry.attributes.position;
    for (let i = 0; i < position.count; i++) {
      position.setY(i, terrainHeight(def, position.getX(i), position.getZ(i)));
    }
    geometry.computeVertexNormals();
    this.waterLevel = uniform(waterLevel);
    this.mesh = new Mesh(geometry, Terrain.material(this.waterLevel));
    this.mesh.name = 'Terrain';
    const vertices = new Float32Array(position.array);
    const indices = new Uint32Array(geometry.index.array);
    this.collider = physics.addStaticTrimesh(vertices, indices, interactionGroups(GROUP.WORLD, GROUP.ALL));
    this.physics = physics;
  }

  /**
   * Mud and earth by height above the water (TSL; both backends).
   * @param {any} waterLevel uniform
   * @returns {MeshStandardNodeMaterial}
   */
  static material(waterLevel) {
    const material = new MeshStandardNodeMaterial({ metalness: 0 });
    const p = positionWorld;
    const above = p.y.sub(waterLevel);
    const broad = mx_noise_float(vec2(p.x, p.z).mul(0.07)).mul(0.5).add(0.5);
    const fine = mx_noise_float(vec2(p.x, p.z).mul(0.9)).mul(0.5).add(0.5);
    const wetMud = color(0x1c1714);
    const mud = color(0x3a2f25);
    const earth = color(0x4a3d2c);
    const grass = color(0x2f3a23);
    const dry = smoothstep(0.05, 0.5, above);
    const high = smoothstep(0.45, 1.2, above.add(broad.mul(0.4)));
    let c = mix(wetMud, mud, dry);
    c = mix(c, earth, high.mul(0.6));
    c = mix(c, grass, high.mul(smoothstep(0.55, 0.75, broad.add(fine.mul(0.25)))));
    material.colorNode = c.mul(float(0.85).add(fine.mul(0.3)));
    material.roughnessNode = mix(float(0.35), float(0.95), dry);
    return material;
  }

  /**
   * @param {number} level
   */
  setWaterLevel(level) {
    this.waterLevel.value = level;
  }

  dispose() {
    this.mesh.removeFromParent();
    this.mesh.geometry.dispose();
    this.mesh.material.dispose();
    this.physics.world.removeCollider(this.collider, false);
  }
}
