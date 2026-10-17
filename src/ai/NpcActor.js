import { uniform } from 'three/tsl';
import { Avatar } from '../player/Avatar.js';
import { inkMaterial } from '../render/inkMaterial.js';
import { PathMover, wrapAngle } from './PathMover.js';

/**
 * A villager in the story (Adi, Mak Som) as a scripted actor: a character avatar on the human animation profile
 * that stands and turns to Bayu when he comes near, runs a layout path at a set pace (Adi's race), flees ahead of
 * the player keeping a lead (Adi over the night roofs), and can be held in an animation state (talking, cursed).
 * Kelam's ink creeps over it and drains away (CULTURE.md: ink-like, colour-draining, freed never killed). No
 * collider: actors never block Bayu. Tuning: data/tuning/npc.json.
 */
export class NpcActor {
  /**
   * @param {object} options
   * @param {string} options.id e.g. 'adi'
   * @param {{ scene: import('three').Object3D }} options.gltf character GLB
   * @param {Map<string, import('three').AnimationClip>} options.clips
   * @param {object} options.profile data/animation/human.json
   * @param {import('three').Object3D} options.parent
   * @param {object} options.tuning data/tuning/npc.json
   */
  constructor({ id, gltf, clips, profile, parent, tuning }) {
    this.id = id;
    this.tuning = tuning;
    this.avatar = new Avatar({ gltf, clips, profile, name: `npc:${id}` });
    this.avatar.root.rotation.order = 'YXZ';
    this.inkAmount = uniform(0);
    this._tell = uniform(0);
    this._materials = [];
    for (const mesh of [...this.avatar.mainMeshes, ...this.avatar.lodMeshes]) {
      mesh.material = inkMaterial(mesh.material, this.inkAmount, this._tell);
      this._materials.push(mesh.material);
    }
    this.avatar.addTo(parent);
    this._setVisible(false);
    /** 'hidden' | 'idle' | 'run' | 'flee' */
    this.mode = 'hidden';
    this.speed = 0;
    this.yaw = 0;
    this._target = 0;
    this._facePlayer = true;
    this._held = null;
    this._ink = { from: 0, to: 0, t: 1, seconds: 1 };
    this._mover = new PathMover(tuning);
    this._air = false;
  }

  /** Whether it is in the world. */
  get visible() {
    return this.mode !== 'hidden';
  }

  /** Feet position (world). */
  get position() {
    return this.avatar.root.position;
  }

  /** Whether a run or flight has reached the end of its path. */
  get arrived() {
    return (this.mode === 'run' || this.mode === 'flee') && this._mover.done;
  }

  /**
   * Stands at a point facing `yaw`; turns to Bayu when he comes near (unless told not to with `face(false)`).
   * @param {{ x: number, y: number, z: number }} position
   * @param {number} yaw radians
   */
  place(position, yaw) {
    this.position.set(position.x, position.y, position.z);
    this.yaw = yaw;
    this._restYaw = yaw;
    this.speed = 0;
    this.mode = 'idle';
    this._setVisible(true);
  }

  /**
   * Runs a path at a fixed pace (a race), then stands at its end.
   * @param {Array<{ x: number, y: number, z: number }>} points
   * @param {number} pace m/s
   */
  run(points, pace) {
    this._startPath(points);
    this._pace = pace;
    this.mode = 'run';
  }

  /**
   * Flees along a path keeping ahead of the player, then hides at its end.
   * @param {Array<{ x: number, y: number, z: number }>} points
   */
  flee(points) {
    this._startPath(points);
    this.mode = 'flee';
  }

  /**
   * Holds an animation state (data/animation/human.json: 'talk', 'cursedIdle', 'stance'…) or releases it (null).
   * @param {string|null} state
   */
  hold(state) {
    this._held = state;
    if (state) this.avatar.animator.setState(state);
    else this.avatar.animator.setState('ground');
  }

  /**
   * Whether the actor turns to face Bayu when he is near and it stands idle.
   * @param {boolean} on
   */
  face(on) {
    this._facePlayer = on;
  }

  /**
   * Fades Kelam's ink to `amount` (0 = clean, 1 = fully cursed) over `seconds`.
   * @param {number} amount
   * @param {number} [seconds=0]
   */
  setInk(amount, seconds = 0) {
    this._ink = { from: this.inkAmount.value, to: amount, t: 0, seconds: Math.max(1e-3, seconds) };
    if (seconds <= 0) this.inkAmount.value = amount;
  }

  /** Leaves the world. */
  hide() {
    this.mode = 'hidden';
    this.speed = 0;
    this._setVisible(false);
  }

  /**
   * @param {number} dt seconds
   * @param {{ x: number, y: number, z: number }} player feet
   * @param {import('three').Camera} camera
   */
  update(dt, player, camera) {
    if (this.mode === 'hidden') return;
    const t = this.tuning;
    const ink = this._ink;
    if (ink.t < 1) {
      ink.t = Math.min(1, ink.t + dt / ink.seconds);
      this.inkAmount.value = ink.from + (ink.to - ink.from) * ink.t;
    }
    if (this.mode === 'run' || this.mode === 'flee') {
      const target = this.mode === 'run' ? this._pace : this._mover.leadSpeed(player, t.flee);
      const step = t.accel * dt;
      this.speed += Math.max(-step, Math.min(step, (this._mover.done ? 0 : target) - this.speed));
      this._mover.advance(this.speed * dt, this.position);
      this._target = this._mover.heading;
      if (this._mover.done && this.speed < 0.05) {
        if (this.mode === 'flee') this.hide();
        else {
          this.mode = 'idle';
          this._restYaw = this._target;
        }
      }
    } else {
      this.speed = 0;
      this._target = this._restYaw ?? this.yaw;
      const dx = player.x - this.position.x;
      const dz = player.z - this.position.z;
      if (this._facePlayer && dx * dx + dz * dz < t.faceDistance * t.faceDistance)
        this._target = Math.atan2(dx, dz);
    }
    if (this.mode === 'hidden') return;
    this.yaw += wrapAngle(this._target - this.yaw) * Math.min(1, dt * t.turnRate);
    const root = this.avatar.root;
    root.rotation.y = this.yaw;
    const animator = this.avatar.animator;
    animator.setSpeed(this.speed);
    if (!this._held) {
      const air = this._mover.lift > 0.25 && this.mode !== 'idle';
      if (air !== this._air) animator.setState(air ? 'air' : 'ground');
      this._air = air;
    }
    this.avatar.update(dt, camera, this.position.y - (this.mode === 'idle' ? 0 : this._mover.lift));
  }

  dispose() {
    this.avatar.dispose();
    for (const material of this._materials) material.dispose();
  }

  _startPath(points) {
    this._mover.setPath(points);
    this.position.set(points[0].x, points[0].y, points[0].z);
    this.yaw = this._target = this._mover.heading;
    this._setVisible(true);
  }

  _setVisible(visible) {
    this.avatar.root.visible = visible;
    if (this.avatar.shadow) this.avatar.shadow.visible = visible;
  }
}
