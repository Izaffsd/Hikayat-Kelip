import { BufferAttribute, Group, Mesh, MeshStandardNodeMaterial, PlaneGeometry } from 'three/webgpu';
import {
  attribute,
  cameraPosition,
  color,
  float,
  mix,
  mx_noise_float,
  normalWorld,
  positionWorld,
  smoothstep,
  time,
  uniform,
  vec2,
  vec3,
} from 'three/tsl';
import { GROUP, interactionGroups } from '../physics/PhysicsWorld.js';
import { ENV } from '../render/environment.js';
import { TerraceField } from './Terraces.js';
import { groundUnderFields } from './terrainHeight.js';

export { terrainHeight, terrainSample, valueNoise } from './terrainHeight.js';

/**
 * Ground colours of the mangrove mudflats (Kampung Berembang); a region's terrain `palette` overrides any of them.
 * `dry` and `high` are the heights above the water (metres) over which mud dries and earth turns to grass.
 */
const PALETTE = {
  wetMud: '#1c1714',
  mud: '#3a2f25',
  earth: '#4a3d2c',
  grass: '#2f3a23',
  bund: '#3f5a2a',
  bank: '#4a6a2e',
  paddy: '#2a3324',
  dry: [0.05, 0.5],
  high: [0.45, 1.2],
};

/**
 * Terrain mesh and collider (mangrove mudflats and the village bank). The mesh colour comes from height: wet dark
 * mud near the water, drier earth and grass tufts higher up, with painterly noise; the collider is a trimesh of the
 * same grid. Terrace fields (paddies) are their own ring meshes (Terraces.js) laid over it, carrying a per-vertex water
 * mask: still water that mirrors the mood's sky and glints in the sun, edged by grassy bunds. `group` holds them all.
 */
export class Terrain {
  /**
   * @param {object} def region.terrain: { center: [x, z], size: [w, d], res: n, base, islands: [...], terraces?: [...],
   *   seed, noise, palette? }
   * @param {import('../physics/PhysicsWorld.js').PhysicsWorld} physics
   * @param {number} waterLevel
   */
  constructor(def, physics, waterLevel) {
    const [w, d] = def.size;
    const res = def.res ?? 128;
    const geometry = new PlaneGeometry(w, d, res, res).rotateX(-Math.PI / 2);
    geometry.translate(def.center[0], 0, def.center[1]);
    const position = geometry.attributes.position;
    const terraces = def.terraces ?? [];
    for (let i = 0; i < position.count; i++) {
      position.setY(i, groundUnderFields(def, position.getX(i), position.getZ(i)));
    }
    geometry.setAttribute('paddy', new BufferAttribute(new Float32Array(position.count), 1));
    geometry.computeVertexNormals();
    this.waterLevel = uniform(waterLevel);
    this.material = Terrain.material(this.waterLevel, { ...PALETTE, ...def.palette });
    this.mesh = new Mesh(geometry, this.material);
    this.mesh.name = 'Terrain';
    this.group = new Group();
    this.group.name = 'TerrainGroup';
    this.group.add(this.mesh);
    const vertices = new Float32Array(position.array);
    const indices = new Uint32Array(geometry.index.array);
    this.collider = physics.addStaticTrimesh(vertices, indices, interactionGroups(GROUP.WORLD, GROUP.ALL));
    this.physics = physics;
    /** @type {TerraceField[]} */
    this.fields = terraces.map((terrace) => new TerraceField(terrace, this.material, physics));
    for (const field of this.fields) this.group.add(field.mesh);
  }

  /**
   * Mud and earth by height above the water; paddy water where the terrace mask says so (TSL; both backends).
   * @param {any} waterLevel uniform
   * @param {object} palette ground colours and height bands (PALETTE)
   * @returns {MeshStandardNodeMaterial}
   */
  static material(waterLevel, palette) {
    const material = new MeshStandardNodeMaterial({ metalness: 0 });
    const p = positionWorld;
    const above = p.y.sub(waterLevel);
    const broad = mx_noise_float(vec2(p.x, p.z).mul(0.07)).mul(0.5).add(0.5);
    const fine = mx_noise_float(vec2(p.x, p.z).mul(0.9)).mul(0.5).add(0.5);
    const dry = smoothstep(palette.dry[0], palette.dry[1], above);
    const high = smoothstep(palette.high[0], palette.high[1], above.add(broad.mul(0.4)));
    let c = mix(color(palette.wetMud), color(palette.mud), dry);
    c = mix(c, color(palette.earth), high.mul(0.6));
    c = mix(c, color(palette.grass), high.mul(smoothstep(0.55, 0.75, broad.add(fine.mul(0.25)))));
    c = c.mul(float(0.85).add(fine.mul(0.3)));
    // Paddies: a grassy bund where the water meets the bank, then still water. Water is dark in itself and mirrors
    // the sky, more at grazing angles (Fresnel); with no environment map the reflection is emissive (unlit), with a
    // slow shimmer, and the surface is very smooth so the low sun glints on it.
    const paddy = attribute('paddy', 'float');
    // A terrace field's dry ground (paddy −1): grassy banks, bunds and crown.
    const bankColour = mix(
      color(palette.bank),
      color(palette.earth),
      smoothstep(0.55, 0.85, broad.add(fine.mul(0.3))).mul(0.55),
    );
    c = mix(c, bankColour.mul(float(0.8).add(fine.mul(0.35))), smoothstep(-0.1, -0.6, paddy));
    const bund = smoothstep(0.02, 0.25, paddy).mul(smoothstep(0.75, 0.35, paddy));
    c = mix(c, color(palette.bund).mul(float(0.8).add(fine.mul(0.4))), bund);
    const view = cameraPosition.sub(p).normalize();
    const facing = view.dot(normalWorld).clamp(0, 1);
    const fresnel = float(1).sub(facing).pow(4).mul(0.85).add(0.12);
    const shimmer = mx_noise_float(vec3(p.x.mul(0.7), p.z.mul(0.7), time.mul(0.35)))
      .mul(0.18)
      .add(0.92);
    const wet = smoothstep(0.6, 0.95, paddy);
    material.colorNode = mix(c, color(palette.paddy), wet);
    material.emissiveNode = ENV.waterSky.mul(fresnel.mul(shimmer).mul(wet));
    material.roughnessNode = mix(mix(float(0.35), float(0.95), dry), float(0.05), wet);
    return material;
  }

  /**
   * @param {number} level
   */
  setWaterLevel(level) {
    this.waterLevel.value = level;
  }

  dispose() {
    this.group.removeFromParent();
    for (const field of this.fields) field.dispose();
    this.mesh.geometry.dispose();
    this.material.dispose();
    this.physics.world.removeCollider(this.collider, false);
  }
}
