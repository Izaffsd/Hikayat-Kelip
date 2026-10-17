import { Mesh, MeshStandardNodeMaterial, PlaneGeometry } from 'three/webgpu';
import { color, float, mix, mx_noise_float, positionWorld, smoothstep, uniform, vec2 } from 'three/tsl';
import { GROUP, interactionGroups } from '../physics/PhysicsWorld.js';
import { terrainHeight } from './terrainHeight.js';

export { terrainHeight, valueNoise } from './terrainHeight.js';

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
