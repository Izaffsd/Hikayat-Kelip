import { AdditiveBlending, MeshBasicNodeMaterial } from 'three/webgpu';
import { cameraPosition, dot, float, max, normalWorld, normalize, positionWorld, pow, vec3 } from 'three/tsl';
import { Avatar } from '../player/Avatar.js';

/**
 * The best run's ghost in a trial: Bayu's model drawn as a pale firefly-green silhouette (additive, brighter at the
 * edges, no shadow), running the recorded line with the locomotion blend from its speed. It never collides.
 */
export class GhostRunner {
  /**
   * @param {object} options
   * @param {{ scene: import('three').Object3D }} options.gltf the player's character GLB
   * @param {Map<string, import('three').AnimationClip>} options.clips
   * @param {object} options.profile data/animation/human.json
   * @param {import('three').Object3D} options.parent
   */
  constructor({ gltf, clips, profile, parent }) {
    this.avatar = new Avatar({ gltf, clips, profile, name: 'ghost', shadow: false });
    this.material = new MeshBasicNodeMaterial({
      transparent: true,
      depthWrite: false,
      blending: AdditiveBlending,
    });
    const view = normalize(cameraPosition.sub(positionWorld));
    const rim = pow(float(1).sub(max(dot(normalWorld, view), 0)), 2);
    this.material.colorNode = vec3(0.55, 0.85, 0.35).mul(rim.mul(0.9).add(0.15));
    this.material.fog = false;
    for (const mesh of [...this.avatar.mainMeshes, ...this.avatar.lodMeshes]) mesh.material = this.material;
    this.avatar.addTo(parent);
    this.avatar.root.visible = false;
    this._pose = { yaw: 0, speed: 0 };
  }

  /** Whether it is shown. */
  get visible() {
    return this.avatar.root.visible;
  }

  /**
   * @param {boolean} visible
   */
  setVisible(visible) {
    this.avatar.root.visible = visible;
  }

  /**
   * Places the ghost at `seconds` into its run.
   * @param {import('./Ghost.js').GhostTrack} track
   * @param {number} seconds
   * @param {number} dt animation seconds
   * @param {import('three').Camera} camera
   */
  update(track, seconds, dt, camera) {
    const pose = track.at(seconds, this.avatar.root.position, this._pose);
    this.avatar.root.rotation.y = pose.yaw;
    this.avatar.animator.setSpeed(seconds >= track.time ? 0 : pose.speed);
    this.avatar.update(dt, camera);
  }

  dispose() {
    this.avatar.dispose();
    this.material.dispose();
  }
}
