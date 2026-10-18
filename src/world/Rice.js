import {
  BufferGeometry,
  Float32BufferAttribute,
  Group,
  InstancedMesh,
  Matrix4,
  MeshStandardNodeMaterial,
} from 'three/webgpu';
import { color, float, mix, positionLocal, sin, time, uv, vec3 } from 'three/tsl';
import { rng } from '../core/random.js';
import { terrainSample } from './terrainHeight.js';

/**
 * Rice in the paddies (Sawah Emas, GDD: gold, green): clumps of real blade geometry (no alpha cards, so no overdraw
 * sorting on phones), instanced in square chunks that are culled by the frustum and by distance. Blades lean in one
 * travelling breeze whose phase comes from their world position, so the wave rolls across the field.
 */
export class Rice {
  /**
   * @param {object} options
   * @param {object} options.terrain region.terrain (terraces with paddies)
   * @param {{ spacing: number, height: [number, number], chunk: number, base: string, mid: string, tip: string,
   *   blades: number, seed?: number }} options.def region.rice
   * @param {{ foliageDensity: number, foliageDistance: number }} options.quality preset
   */
  constructor({ terrain, def, quality }) {
    this.group = new Group();
    this.group.name = 'Rice';
    this.distance = quality.foliageDistance;
    this.geometry = Rice.clump(def.blades, def.seed ?? 1);
    this.material = Rice.material(def);
    /** @type {Array<{ mesh: InstancedMesh, x: number, z: number }>} */
    this.chunks = [];
    const spacing = def.spacing / Math.sqrt(Math.max(0.05, quality.foliageDensity));
    const random = rng(def.seed ?? 1);
    const sample = { height: 0, paddy: 0 };
    const matrix = new Matrix4();
    const [cx, cz] = terrain.center;
    const [w, d] = terrain.size;
    for (let x0 = cx - w / 2; x0 < cx + w / 2; x0 += def.chunk) {
      for (let z0 = cz - d / 2; z0 < cz + d / 2; z0 += def.chunk) {
        const transforms = [];
        for (let x = x0; x < x0 + def.chunk; x += spacing) {
          for (let z = z0; z < z0 + def.chunk; z += spacing) {
            const px = x + (random() - 0.5) * spacing * 0.8;
            const pz = z + (random() - 0.5) * spacing * 0.8;
            terrainSample(terrain, px, pz, sample);
            if (sample.paddy < 0.85) continue;
            const height = def.height[0] + (def.height[1] - def.height[0]) * random();
            const spread = 0.8 + random() * 0.4;
            transforms.push(px, sample.height, pz, height, spread);
          }
        }
        if (!transforms.length) continue;
        const count = transforms.length / 5;
        const mesh = new InstancedMesh(this.geometry, this.material, count);
        for (let i = 0; i < count; i++) {
          const k = i * 5;
          matrix
            .makeScale(transforms[k + 4], transforms[k + 3], transforms[k + 4])
            .setPosition(transforms[k], transforms[k + 1], transforms[k + 2]);
          mesh.setMatrixAt(i, matrix);
        }
        mesh.instanceMatrix.needsUpdate = true;
        mesh.computeBoundingSphere();
        mesh.castShadow = false;
        mesh.receiveShadow = true;
        this.group.add(mesh);
        this.chunks.push({ mesh, x: x0 + def.chunk / 2, z: z0 + def.chunk / 2 });
      }
    }
  }

  /** Number of clumps (tests, debug). */
  get count() {
    return this.chunks.reduce((sum, chunk) => sum + chunk.mesh.count, 0);
  }

  /**
   * Hides chunks beyond the foliage distance (fog covers the edge).
   * @param {{ x: number, z: number }} focus the camera
   */
  update(focus) {
    const limit = (this.distance + 24) ** 2;
    for (const chunk of this.chunks) {
      const dx = chunk.x - focus.x;
      const dz = chunk.z - focus.z;
      chunk.mesh.visible = dx * dx + dz * dz < limit;
    }
  }

  dispose() {
    this.group.removeFromParent();
    this.geometry.dispose();
    this.material.dispose();
    for (const chunk of this.chunks) chunk.mesh.dispose();
  }

  /**
   * One clump: `blades` thin blades fanning out from a common base, each three segments that curve outward, 1 m tall
   * before instance scaling. uv.y runs base (0) to tip (1).
   * @param {number} blades
   * @param {number} seed
   * @returns {BufferGeometry}
   */
  static clump(blades, seed) {
    const random = rng(seed + 101);
    const positions = [];
    const uvs = [];
    const segments = 3;
    for (let b = 0; b < blades; b++) {
      const angle = (b / blades) * Math.PI * 2 + random() * 0.6;
      const lean = 0.22 + random() * 0.3;
      const width = 0.02 + random() * 0.01;
      const dx = Math.cos(angle);
      const dz = Math.sin(angle);
      const ring = [];
      for (let s = 0; s <= segments; s++) {
        const t = s / segments;
        const out = lean * t * t;
        const half = width * (1 - t * 0.85);
        const cx = dx * out;
        const cz = dz * out;
        ring.push([cx - dz * half, t, cz + dx * half, cx + dz * half, t, cz - dx * half, t]);
      }
      for (let s = 0; s < segments; s++) {
        const [ax, ay, az, bx, by, bz, ta] = ring[s];
        const [cx, cy, cz, ex, ey, ez, tb] = ring[s + 1];
        positions.push(ax, ay, az, bx, by, bz, cx, cy, cz, bx, by, bz, ex, ey, ez, cx, cy, cz);
        uvs.push(0, ta, 1, ta, 0, tb, 1, ta, 1, tb, 0, tb);
      }
    }
    const geometry = new BufferGeometry();
    geometry.setAttribute('position', new Float32BufferAttribute(positions, 3));
    geometry.setAttribute('uv', new Float32BufferAttribute(uvs, 2));
    geometry.computeVertexNormals();
    return geometry;
  }

  /**
   * Colour from base to tip (green to gold), double-sided, swaying in the breeze (TSL; both backends).
   * @param {{ base: string, mid: string, tip: string, wind?: number }} def
   * @returns {MeshStandardNodeMaterial}
   */
  static material(def) {
    const material = new MeshStandardNodeMaterial({ side: 2, roughness: 0.75, metalness: 0 });
    const t = uv().y;
    material.colorNode = mix(
      mix(color(def.base), color(def.mid), t.clamp(0, 0.5).mul(2)),
      color(def.tip),
      t.sub(0.5).clamp(0, 0.5).mul(2),
    );
    // positionNode runs after instancing: positionLocal is the blade's place in the field (chunks sit at the origin).
    const phase = positionLocal.x.mul(0.23).add(positionLocal.z.mul(0.17));
    const sway = sin(time.mul(1.6).add(phase))
      .mul(0.5)
      .add(sin(time.mul(2.7).add(phase.mul(1.7))).mul(0.2));
    const bend = t.mul(t).mul(float(def.wind ?? 0.12));
    material.positionNode = positionLocal.add(vec3(sway.mul(bend), float(0), sway.mul(bend).mul(0.4)));
    return material;
  }
}
