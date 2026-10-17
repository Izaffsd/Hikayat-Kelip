import { Euler, Group, InstancedMesh, Matrix4, Quaternion, Vector3 } from 'three/webgpu';
import { GROUP, interactionGroups } from '../physics/PhysicsWorld.js';
import { seeThrough } from '../render/occlusion.js';

const DEG = Math.PI / 180;

/**
 * Converts a Blender-space offset string ("x,y,z", Z up) from kit extras to three.js space (Y up).
 * @param {string|undefined} text
 * @returns {Vector3|null}
 */
function blenderOffset(text) {
  if (!text) return null;
  const [x, y, z] = String(text).split(',').map(Number);
  return new Vector3(x, z, -y);
}

/**
 * @typedef {object} KitPiece
 * @property {string} name
 * @property {Array<{ geometry: any, material: any, matrix: Matrix4 }>} parts meshes relative to the piece origin
 * @property {Array<{ position: Vector3, quaternion: Quaternion, half: Vector3 }>} colliders boxes relative to the origin
 * @property {string[]} tags traversal/gameplay tags (wall, wallrun, roof, post, prop, …)
 * @property {string|undefined} light light kind (pelita, kelip)
 * @property {Vector3|null} lightOffset
 */

/**
 * Turns a region layout into the playable level (TECHNICAL §4.1): every kit piece type becomes one InstancedMesh
 * per part (few draw calls however many houses there are), every collider box authored on a kit piece becomes a
 * Rapier box at each placement, and colliders remember their piece's tags so traversal can ask "is this a
 * wall-run wall?". Thin props never block the camera.
 */
export class LevelBuilder {
  /**
   * Indexes a kit GLB by piece name (nodes carrying `hk_piece` extras).
   * @param {{ scene: import('three').Object3D }} gltf
   * @returns {Map<string, KitPiece>}
   */
  static indexKit(gltf) {
    /** @type {Map<string, KitPiece>} */
    const pieces = new Map();
    gltf.scene.updateMatrixWorld(true);
    const inverse = new Matrix4();
    for (const root of gltf.scene.children) {
      const name = root.userData.hk_piece;
      if (!name) continue;
      inverse.copy(root.matrixWorld).invert();
      /** @type {KitPiece} */
      const piece = {
        name,
        parts: [],
        colliders: [],
        tags: String(root.userData.hk_tags ?? '')
          .split(',')
          .filter(Boolean),
        light: root.userData.hk_light,
        lightOffset: blenderOffset(root.userData.hk_light_offset),
      };
      root.traverse((object) => {
        const local = new Matrix4().multiplyMatrices(inverse, object.matrixWorld);
        if (object.userData.hk_collider === 'box') {
          const position = new Vector3();
          const quaternion = new Quaternion();
          const half = new Vector3();
          local.decompose(position, quaternion, half);
          piece.colliders.push({ position, quaternion, half });
        } else if (object.isMesh) {
          piece.parts.push({ geometry: object.geometry, material: object.material, matrix: local });
        }
      });
      pieces.set(name, piece);
    }
    return pieces;
  }

  /**
   * @param {object} options
   * @param {import('../physics/PhysicsWorld.js').PhysicsWorld} options.physics
   * @param {Set<string>} [options.noCameraBlock] piece names whose colliders the camera passes through
   * @param {Array<{ c: number[], h: number[] }>} [options.cameraPass] boxes inside which kit colliders do not block
   *   the camera (the pondok roof over the jetty fight: the camera keeps its distance and the roof turns see-through)
   */
  constructor({ physics, noCameraBlock = new Set(), cameraPass = [] }) {
    this.physics = physics;
    this.noCameraBlock = noCameraBlock;
    this.cameraPass = cameraPass;
    /** collider handle → tags of the piece it belongs to */
    this.colliderTags = new Map();
    /** @type {any[]} */
    this.colliders = [];
    this._matrix = new Matrix4();
    this._placement = new Matrix4();
    this._position = new Vector3();
    this._quaternion = new Quaternion();
    this._scale = new Vector3();
    this._euler = new Euler();
  }

  /**
   * Builds placements of kit pieces.
   * @param {Map<string, KitPiece>} pieces
   * @param {Array<[string, number, number, number, number?, number?, number?, number?]>} placements
   *   [piece, x, y, z, yawDeg, pitchDeg, rollDeg, scale]
   * @returns {{ root: Group, lights: Array<{ kind: string, position: Vector3 }>, counts: Record<string, number> }}
   */
  buildPlacements(pieces, placements) {
    const root = new Group();
    root.name = 'Level';
    /** @type {Map<string, Matrix4[]>} */
    const byPiece = new Map();
    for (const [name, x, y, z, yaw = 0, pitch = 0, roll = 0, scale = 1] of placements) {
      if (!pieces.has(name)) throw new Error(`Layout uses unknown kit piece "${name}"`);
      this._euler.set(pitch * DEG, yaw * DEG, roll * DEG, 'YXZ');
      this._quaternion.setFromEuler(this._euler);
      const matrix = new Matrix4().compose(
        this._position.set(x, y, z),
        this._quaternion,
        this._scale.set(scale, scale, scale),
      );
      if (!byPiece.has(name)) byPiece.set(name, []);
      byPiece.get(name).push(matrix);
    }

    const lights = [];
    const counts = {};
    for (const [name, matrices] of byPiece) {
      const piece = pieces.get(name);
      counts[name] = matrices.length;
      for (const part of piece.parts) {
        const mesh = new InstancedMesh(part.geometry, seeThrough(part.material), matrices.length);
        mesh.name = `${name}:${part.material.name ?? 'part'}`;
        matrices.forEach((placement, i) => {
          this._matrix.multiplyMatrices(placement, part.matrix);
          mesh.setMatrixAt(i, this._matrix);
        });
        mesh.instanceMatrix.needsUpdate = true;
        mesh.computeBoundingSphere();
        root.add(mesh);
      }
      const blocksCamera = !this.noCameraBlock.has(name);
      for (const placement of matrices) {
        for (const box of piece.colliders) this._addCollider(placement, box, piece.tags, blocksCamera);
        if (piece.light && piece.lightOffset) {
          lights.push({ kind: piece.light, position: piece.lightOffset.clone().applyMatrix4(placement) });
        }
      }
    }
    return { root, lights, counts };
  }

  /**
   * Adds invisible authored colliders (walls of the world, extra steps): { c: [x,y,z], h: [hx,hy,hz], yaw?, tags? }.
   * @param {Array<{ c: number[], h: number[], yaw?: number, tags?: string, camera?: boolean }>} boxes
   */
  addBoxes(boxes) {
    for (const box of boxes) {
      this._quaternion.setFromEuler(this._euler.set(0, (box.yaw ?? 0) * DEG, 0));
      const filter = box.camera === false ? GROUP.ALL & ~GROUP.CAMERA : GROUP.ALL;
      const collider = this.physics.addStaticBox(
        { x: box.c[0], y: box.c[1], z: box.c[2] },
        { x: box.h[0], y: box.h[1], z: box.h[2] },
        {
          rotation: {
            x: this._quaternion.x,
            y: this._quaternion.y,
            z: this._quaternion.z,
            w: this._quaternion.w,
          },
          groups: interactionGroups(GROUP.WORLD, filter),
        },
      );
      this.colliders.push(collider);
      if (box.tags) this.colliderTags.set(collider.handle, box.tags.split(','));
    }
  }

  /**
   * Tags of the piece a collider belongs to (empty when untagged).
   * @param {any} collider
   * @returns {string[]}
   */
  tagsOf(collider) {
    return (collider && this.colliderTags.get(collider.handle)) || [];
  }

  /** Removes every collider this builder created. */
  dispose() {
    for (const collider of this.colliders) this.physics.world.removeCollider(collider, false);
    this.colliders.length = 0;
    this.colliderTags.clear();
  }

  _addCollider(placement, box, tags, blocksCamera) {
    this._matrix.compose(box.position, box.quaternion, this._scale.set(1, 1, 1));
    this._matrix.premultiply(placement);
    this._matrix.decompose(this._position, this._quaternion, this._scale);
    const half = box.half;
    const camera = blocksCamera && !this._inCameraPass(this._position);
    const filter = camera ? GROUP.ALL : GROUP.ALL & ~GROUP.CAMERA;
    const collider = this.physics.addStaticBox(
      { x: this._position.x, y: this._position.y, z: this._position.z },
      { x: half.x * this._scale.x, y: half.y * this._scale.y, z: half.z * this._scale.z },
      {
        rotation: {
          x: this._quaternion.x,
          y: this._quaternion.y,
          z: this._quaternion.z,
          w: this._quaternion.w,
        },
        groups: interactionGroups(GROUP.WORLD, filter),
      },
    );
    this.colliders.push(collider);
    if (tags.length) this.colliderTags.set(collider.handle, tags);
  }

  _inCameraPass(p) {
    for (const { c, h } of this.cameraPass) {
      if (Math.abs(p.x - c[0]) <= h[0] && Math.abs(p.y - c[1]) <= h[1] && Math.abs(p.z - c[2]) <= h[2])
        return true;
    }
    return false;
  }
}
