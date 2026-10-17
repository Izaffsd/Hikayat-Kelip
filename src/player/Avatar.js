import { Group, Mesh, MeshBasicNodeMaterial, PlaneGeometry, Vector3 } from 'three/webgpu';
import { float, smoothstep, uv, vec3 } from 'three/tsl';
import { clone as cloneSkinned } from 'three/addons/utils/SkeletonUtils.js';
import { Animator } from './Animator.js';

const SHADOW_GEOMETRY = new PlaneGeometry(1, 1).rotateX(-Math.PI / 2);
let shadowMaterial = null;

/**
 * A character's visual: a clone of a skinned character GLB (several avatars can share one load), its Animator,
 * distance LOD between the main and `__lod1` meshes, a soft blob shadow that follows the ground (TECHNICAL §3.2:
 * Low uses blob shadows), and props attached to bones (the tongkat, the wau).
 *
 * The owner sets `root.position` (feet) and `root.rotation.y` (facing, 0 = +Z) every frame and calls `update`.
 */
export class Avatar {
  /**
   * @param {object} options
   * @param {{ scene: import('three').Object3D }} options.gltf loaded character GLB
   * @param {Map<string, import('three').AnimationClip>} options.clips
   * @param {object} options.profile data/animation/<profile>.json
   * @param {string} [options.name]
   * @param {number} [options.lodDistance=16] metres at which the LOD1 mesh takes over
   * @param {boolean} [options.shadow=true]
   */
  constructor({ gltf, clips, profile, name = 'avatar', lodDistance = 16, shadow = true }) {
    this.root = new Group();
    this.root.name = name;
    this.model = cloneSkinned(gltf.scene);
    this.root.add(this.model);
    /** @type {import('three').SkinnedMesh[]} */
    this.mainMeshes = [];
    /** @type {import('three').SkinnedMesh[]} */
    this.lodMeshes = [];
    /** @type {Map<string, import('three').Bone>} */
    this.bones = new Map();
    this.model.traverse((object) => {
      if (object.isBone) this.bones.set(object.name, object);
      if (!object.isSkinnedMesh) return;
      object.frustumCulled = false; // animated poses leave the bind-pose bounds; characters are few
      if (object.name.endsWith('__lod1')) this.lodMeshes.push(object);
      else this.mainMeshes.push(object);
    });
    this.lodDistance = lodDistance;
    this._lodActive = false;
    this._setLod(false);
    this.animator = new Animator(this.model, clips, profile);
    this.shadow = shadow ? new Mesh(SHADOW_GEOMETRY, getShadowMaterial()) : null;
    if (this.shadow) {
      this.shadow.renderOrder = 1;
      this.shadow.frustumCulled = false;
    }
    this._world = new Vector3();
  }

  /**
   * Adds the avatar (and its shadow) to a parent.
   * @param {import('three').Object3D} parent
   */
  addTo(parent) {
    parent.add(this.root);
    if (this.shadow) parent.add(this.shadow);
  }

  /** Removes the avatar from the scene and frees its animation state (the shared GLB stays loaded). */
  dispose() {
    this.root.removeFromParent();
    this.shadow?.removeFromParent();
    this.animator.dispose();
  }

  /**
   * Attaches an object to a bone (props: the tongkat in the right hand, the wau on the back).
   * @param {import('three').Object3D} object
   * @param {string} boneName
   * @returns {import('three').Object3D}
   */
  attach(object, boneName) {
    const bone = this.bones.get(boneName);
    if (!bone) throw new Error(`Avatar: no bone "${boneName}"`);
    bone.add(object);
    return object;
  }

  /**
   * Per-frame update: animation, LOD and the blob shadow.
   * @param {number} dt
   * @param {import('three').Camera} camera
   * @param {number} [groundY] height of the ground under the feet (for the shadow); NaN hides it
   * @param {number} [lodBias=1]
   */
  update(dt, camera, groundY = this.root.position.y, lodBias = 1) {
    this.animator.update(dt);
    const distance = camera.position.distanceTo(this.root.position);
    const far = distance > this.lodDistance * lodBias;
    if (far !== this._lodActive && this.lodMeshes.length) this._setLod(far);
    if (this.shadow) {
      const height = this.root.position.y - groundY;
      const visible = Number.isFinite(groundY) && height < 6;
      this.shadow.visible = visible;
      if (visible) {
        const size = 1.1 * Math.max(0.35, 1 - height * 0.18);
        this.shadow.position.set(this.root.position.x, groundY + 0.03, this.root.position.z);
        this.shadow.scale.set(size, 1, size);
      }
    }
  }

  _setLod(far) {
    this._lodActive = far;
    for (const mesh of this.mainMeshes) mesh.visible = !far || this.lodMeshes.length === 0;
    for (const mesh of this.lodMeshes) mesh.visible = far;
  }
}

/** Shared soft round shadow: dark centre fading to transparent at the edge. */
function getShadowMaterial() {
  if (shadowMaterial) return shadowMaterial;
  shadowMaterial = new MeshBasicNodeMaterial({ transparent: true, depthWrite: false });
  const d = uv().sub(0.5).length().mul(2);
  shadowMaterial.colorNode = vec3(0.02, 0.03, 0.06);
  shadowMaterial.opacityNode = float(1)
    .sub(smoothstep(0.25, 1.0, d))
    .mul(0.55);
  return shadowMaterial;
}
