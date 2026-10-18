import { BufferAttribute, BufferGeometry, Mesh } from 'three/webgpu';
import { GROUP, interactionGroups } from '../physics/PhysicsWorld.js';
import { BUND, crownRadius, paddyEdge, terraceBreaks, terraceProfile } from './terrainHeight.js';

/**
 * A terrace field as its own mesh (Sawah Emas): concentric elliptical rings around the field's centre with
 * breakpoints exactly at each bank's top and foot, the water's edges and the bund on each lip, then the skirt. So the
 * terraces curve smoothly, the paddy water ends cleanly along the bunds, and the ground grid underneath can stay
 * coarse. Heights come from `terraceProfile`, the same function the layouts and the rice use, and the collider is
 * built from this mesh, so what you see, what you stand on and where things are placed agree.
 */
export class TerraceField {
  /**
   * @param {object} terrace a region.terrain.terraces entry
   * @param {import('three').Material} material the terrain material (reads the `paddy` attribute)
   * @param {import('../physics/PhysicsWorld.js').PhysicsWorld} physics
   * @param {number} [segmentLength=2] metres between ring vertices along the field's rim
   */
  constructor(terrace, material, physics, segmentLength = 2) {
    const geometry = TerraceField.geometry(terrace, segmentLength);
    this.mesh = new Mesh(geometry, material);
    this.mesh.name = 'TerraceField';
    this.mesh.receiveShadow = true;
    this.physics = physics;
    this.collider = physics.addStaticTrimesh(
      new Float32Array(geometry.attributes.position.array),
      new Uint32Array(geometry.index.array),
      interactionGroups(GROUP.WORLD, GROUP.ALL),
    );
  }

  dispose() {
    this.mesh.removeFromParent();
    this.mesh.geometry.dispose();
    this.physics.world.removeCollider(this.collider, false);
  }

  /**
   * The ring breakpoints of a field along one ray, as elliptical distances from the centre outward.
   * @param {object} terrace
   * @param {number} metric metres per unit of elliptical distance along the ray
   * @returns {number[]}
   */
  static rings(terrace, metric) {
    const edge = paddyEdge(terrace);
    const crown = crownRadius(terrace);
    const climb = terrace.h - terrace.base;
    const out = [crown];
    if (climb > 0) {
      const b = terraceBreaks(terrace, metric);
      const levels = Math.round(climb / terrace.step);
      const toD = (k, u) => crown + (1 - ((k + u) * terrace.step) / climb) * (edge - crown);
      const foot = 1 - b.bankShare;
      for (let k = levels - 1; k >= 0; k--) {
        // Descending u within level k: through the bank, the water's edges, the bund, to the lip.
        const us = [
          foot + b.bankShare * 0.66,
          foot + b.bankShare * 0.33,
          foot,
          b.waterTop,
          b.waterBottom,
          b.bund,
          b.bund * 0.5,
          0,
        ];
        for (const u of us) out.push(toD(k, u));
      }
    } else {
      // A flat field: a bund around its edge.
      const toD = (metres) => edge - metres / metric;
      out.push(toD(BUND.width + BUND.waterFade), toD(BUND.width), toD(BUND.width * 0.5), edge);
    }
    for (const t of [0.25, 0.5, 0.75, 0.999]) out.push(edge + (1 - edge) * t);
    // Strictly increasing (degenerate bands on very steep or very gentle rays collapse harmlessly).
    for (let i = 1; i < out.length; i++) out[i] = Math.max(out[i], out[i - 1] + 1e-5);
    return out;
  }

  /**
   * Builds the field's geometry: a centre vertex, then `rings × segments` vertices, with `position` and `paddy`.
   * @param {object} terrace
   * @param {number} segmentLength
   * @returns {BufferGeometry}
   */
  static geometry(terrace, segmentLength) {
    const perimeter = Math.PI * 2 * Math.sqrt((terrace.rx * terrace.rx + terrace.rz * terrace.rz) / 2);
    const segments = Math.max(48, Math.ceil(perimeter / segmentLength));
    const angle = ((terrace.rot ?? 0) * Math.PI) / 180;
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    const ringCount = TerraceField.rings(terrace, terrace.rx).length;
    const vertexCount = 1 + ringCount * segments;
    const positions = new Float32Array(vertexCount * 3);
    const paddy = new Float32Array(vertexCount);
    const sample = { height: 0, paddy: 0 };
    terraceProfile(terrace, 0, terrace.rx, sample);
    positions.set([terrace.x, sample.height, terrace.z], 0);
    paddy[0] = sample.paddy;
    for (let j = 0; j < segments; j++) {
      const phi = (j / segments) * Math.PI * 2;
      const c = Math.cos(phi);
      const s = Math.sin(phi);
      const metric = Math.hypot(terrace.rx * c, terrace.rz * s);
      const rings = TerraceField.rings(terrace, metric);
      for (let i = 0; i < rings.length; i++) {
        const d = rings[i];
        terraceProfile(terrace, Math.min(d, 0.9999), metric, sample);
        // The field's own dry ground (banks, bunds, the crown) is marked −1: the shader grasses it over.
        const onField = d <= paddyEdge(terrace) + 1e-6;
        // The point at elliptical distance d along this ray, rotated into the world (inverse of fieldCoords).
        const lx = terrace.rx * d * c;
        const lz = terrace.rz * d * s;
        const v = 1 + i * segments + j;
        positions[v * 3] = terrace.x + lx * cos - lz * sin;
        positions[v * 3 + 1] = sample.height;
        positions[v * 3 + 2] = terrace.z + lx * sin + lz * cos;
        paddy[v] = onField && sample.paddy <= 0 ? -1 : sample.paddy;
      }
    }
    const indices = [];
    // Centre fan, wound so faces point up (+Y).
    for (let j = 0; j < segments; j++) indices.push(0, 1 + ((j + 1) % segments), 1 + j);
    for (let i = 0; i < ringCount - 1; i++) {
      for (let j = 0; j < segments; j++) {
        const j2 = (j + 1) % segments;
        const a = 1 + i * segments + j;
        const b = 1 + i * segments + j2;
        const c = 1 + (i + 1) * segments + j;
        const d = 1 + (i + 1) * segments + j2;
        indices.push(a, b, c, b, d, c);
      }
    }
    const geometry = new BufferGeometry();
    geometry.setAttribute('position', new BufferAttribute(positions, 3));
    geometry.setAttribute('paddy', new BufferAttribute(paddy, 1));
    geometry.setIndex(indices);
    geometry.computeVertexNormals();
    geometry.computeBoundingSphere();
    return geometry;
  }
}
