import { Group, Quaternion, Vector3 } from 'three/webgpu';
import { clone as cloneSkinned } from 'three/addons/utils/SkeletonUtils.js';
import { PathMover, wrapAngle } from './PathMover.js';

const AXIS_X = new Vector3(1, 0, 0);
const AXIS_Z = new Vector3(0, 0, 1);
const TAU = Math.PI * 2;

/** Leg chains on the quadruped rig: upper, lower, paw. */
const LEGS = [
  { leg: 'fore_l', upper: 'upperarm_l', lower: 'forearm_l', paw: 'paw_l', fore: true },
  { leg: 'fore_r', upper: 'upperarm_r', lower: 'forearm_r', paw: 'paw_r', fore: true },
  { leg: 'hind_l', upper: 'thigh_l', lower: 'shin_l', paw: 'hindpaw_l', fore: false },
  { leg: 'hind_r', upper: 'thigh_r', lower: 'shin_r', paw: 'hindpaw_r', fore: false },
];
const TAIL = ['tail1', 'tail2', 'tail3', 'tail4', 'tail5'];

const clamp01 = (v) => Math.min(1, Math.max(0, v));
const smooth = (a, b, v) => {
  const t = clamp01((v - a) / (b - a));
  return t * t * (3 - 2 * t);
};

/**
 * Tok Belang, the guardian tiger (GDD Characters), as a scripted actor: the 26-bone quadruped rig animated in code
 * (CLAUDE.md: never tiger clips) — a walk that becomes a rotary gallop with speed (legs, spine flex, body bob, a
 * lagging tail), breathing and a slow tail at rest, a low crouch for the standoff and a head-up roar. In the prologue
 * chase (GDD 2:00) it flees along a layout path, keeping a lead on the player: it bolts when Wan closes in and waits,
 * looking back, when he falls behind; steps up or down the path become leaps. No collider (it is always ahead).
 * Tuning: data/tuning/tiger.json.
 */
export class TokBelang {
  /**
   * @param {object} options
   * @param {{ scene: import('three').Object3D }} options.gltf characters/tokbelang
   * @param {import('three').Object3D} options.parent
   * @param {object} options.tuning data/tuning/tiger.json
   */
  constructor({ gltf, parent, tuning }) {
    this.tuning = tuning;
    this.root = new Group();
    this.root.name = 'TokBelang';
    this.root.visible = false;
    this.model = cloneSkinned(gltf.scene);
    this.model.rotation.y = tuning.modelYaw;
    this.model.scale.setScalar(tuning.scale);
    this.root.add(this.model);
    /** @type {Map<string, import('three').Bone>} */
    this.bones = new Map();
    /** @type {Map<string, Quaternion>} */
    this.rest = new Map();
    this.mainMeshes = [];
    this.lodMeshes = [];
    this.model.traverse((object) => {
      if (object.isBone) {
        this.bones.set(object.name, object);
        this.rest.set(object.name, object.quaternion.clone());
      }
      if (!object.isSkinnedMesh) return;
      object.frustumCulled = false;
      (object.name.endsWith('__lod1') ? this.lodMeshes : this.mainMeshes).push(object);
    });
    this._lod = null;
    this._setLod(false);
    parent.add(this.root);

    /** 'hidden' | 'chase' | 'toStandoff' | 'standoff' | 'preview' */
    this.mode = 'hidden';
    this.speed = 0;
    this.yaw = 0;
    this.phase = 0;
    this._time = 0;
    this._crouch = 0;
    this._roar = 0;
    this._mover = new PathMover(tuning.chase);
    this._standoff = null;
    this._q = new Quaternion();
    this._v = new Vector3();
  }

  /** Whether it is in the world. */
  get visible() {
    return this.mode !== 'hidden';
  }

  /** Feet position (world). */
  get position() {
    return this.root.position;
  }

  /**
   * Flees along a path ahead of the player, then goes to `end` (if given) and waits there, crouched.
   * @param {Vector3[]} points layout path (feet heights)
   * @param {{ position: { x: number, y: number, z: number }, yaw: number }|null} [end]
   */
  chase(points, end = null) {
    this._mover.setPath(points);
    this._standoff = end;
    this.root.position.copy(points[0]);
    this.yaw = this._mover.heading;
    this.speed = this.tuning.chase.runSpeed;
    this._crouch = 0;
    this._show('chase');
  }

  /**
   * Waits at a point facing `yaw`, crouched (the standoff). Walks there if it is close, else appears there.
   * @param {{ x: number, y: number, z: number }} position
   * @param {number} yaw radians
   */
  standoff(position, yaw) {
    this._standoff = { position: { x: position.x, y: position.y, z: position.z }, yaw };
    const far =
      !this.visible || this.root.position.distanceTo(this._v.set(position.x, position.y, position.z)) > 8;
    if (far) {
      this.root.position.set(position.x, position.y, position.z);
      this.yaw = yaw;
      this.speed = 0;
      this._show('standoff');
    } else {
      this.mode = 'toStandoff';
    }
  }

  /**
   * Holds a gait in place at `speed` (live tuning and test screenshots): animates as if moving, without moving.
   * @param {{ x: number, y: number, z: number }} position
   * @param {number} yaw
   * @param {number} speed m/s; 0 with `crouch` shows the standoff crouch
   * @param {boolean} [crouch=false]
   */
  preview(position, yaw, speed, crouch = false) {
    this.root.position.set(position.x, position.y, position.z);
    this.yaw = yaw;
    this.speed = speed;
    this._crouch = crouch ? 1 : 0;
    this._show(crouch ? 'standoff' : 'preview');
  }

  /** Lifts its head and roars (story beat; the sound comes with the audio pass). */
  roar() {
    this._roar = 1;
  }

  /** Leaves the world. */
  hide() {
    this.mode = 'hidden';
    this.root.visible = false;
    this.speed = 0;
  }

  /**
   * @param {number} dt seconds
   * @param {{ x: number, y: number, z: number }} player feet
   * @param {import('three').Camera} camera
   */
  update(dt, player, camera) {
    if (this.mode === 'hidden') return;
    this._time += dt;
    if (this.mode === 'chase') this._updateChase(dt, player);
    else if (this.mode === 'toStandoff') this._updateToStandoff(dt);
    else if (this.mode !== 'preview') this.speed = Math.max(0, this.speed - this.tuning.chase.accel * dt);
    const crouchTarget = this.mode === 'standoff' ? 1 : 0;
    this._crouch += (crouchTarget - this._crouch) * Math.min(1, dt * 3);
    this._roar = Math.max(0, this._roar - dt / 1.6);
    this.root.rotation.y = this.yaw;
    this._animate(dt);
    const far = camera.position.distanceTo(this.root.position) > this.tuning.lodDistance;
    if (far !== this._lod && this.lodMeshes.length) this._setLod(far);
  }

  dispose() {
    this.root.removeFromParent();
  }

  _show(mode) {
    this.mode = mode;
    this.root.visible = true;
  }

  _updateChase(dt, player) {
    const c = this.tuning.chase;
    // Close the lead → bolt; comfortable → run; too far ahead → slow down and wait, looking back.
    const target = this._mover.leadSpeed(player, c);
    const step = c.accel * dt;
    this.speed += Math.max(-step, Math.min(step, target - this.speed));
    this._mover.advance(this.speed * dt, this.root.position);
    this._turnTo(this._mover.heading, dt);
    if (this._mover.done) this.mode = this._standoff ? 'toStandoff' : 'standoff';
  }

  _updateToStandoff(dt) {
    const c = this.tuning.chase;
    const goal = this._standoff.position;
    const p = this.root.position;
    const dx = goal.x - p.x;
    const dz = goal.z - p.z;
    const d = Math.hypot(dx, dz);
    if (d < 0.15) {
      this._turnTo(this._standoff.yaw, dt);
      this.speed = Math.max(0, this.speed - c.accel * dt);
      if (Math.abs(wrapAngle(this._standoff.yaw - this.yaw)) < 0.05) this.mode = 'standoff';
      return;
    }
    const target = Math.min(c.runSpeed, Math.max(c.standoffWalk, d * 1.5));
    const step = c.accel * dt;
    this.speed += Math.max(-step, Math.min(step, target - this.speed));
    const move = Math.min(d, this.speed * dt);
    p.x += (dx / d) * move;
    p.z += (dz / d) * move;
    p.y += (goal.y - p.y) * Math.min(1, dt * 4);
    this._turnTo(Math.atan2(dx, dz), dt);
  }

  _turnTo(yaw, dt) {
    this.yaw += wrapAngle(yaw - this.yaw) * Math.min(1, dt * this.tuning.chase.turnRate);
  }

  /** Sets a bone to its rest rotation turned by `ax` about its X axis and `az` about its Z axis. */
  _rot(name, ax, az = 0) {
    const bone = this.bones.get(name);
    if (!bone) return;
    bone.quaternion.copy(this.rest.get(name));
    if (ax) bone.quaternion.multiply(this._q.setFromAxisAngle(AXIS_X, ax));
    if (az) bone.quaternion.multiply(this._q.setFromAxisAngle(AXIS_Z, az));
  }

  _animate(dt) {
    const { gait: g, idle, crouch: k, signs } = this.tuning;
    const speed = this.speed;
    const gallop = smooth(g.gallopFrom - 1, g.gallopFrom + 1, speed);
    const moving = clamp01(speed / 1.5);
    const stride = g.walkStride + (g.gallopStride - g.walkStride) * gallop;
    this.phase = (this.phase + (dt * speed) / stride) % 1;
    const c = this._crouch;
    const airborne = this.mode === 'chase' && this._mover.lift > 0.2 ? 1 : 0;
    for (let l = 0; l < LEGS.length; l++) {
      const { leg, upper, lower, paw, fore } = LEGS[l];
      const kind = fore ? 'fore' : 'hind';
      const offset = g.walkOffsets[leg] + (g.gallopOffsets[leg] - g.walkOffsets[leg]) * gallop;
      const t = TAU * (this.phase + offset);
      const amp = (g.swing[kind] + (g.gallopSwing[kind] - g.swing[kind]) * gallop) * moving;
      // Mid-leap: forelegs reach forward, hind legs trail.
      const reach = airborne * (fore ? 0.6 : -0.6);
      const swing = (Math.sin(t) * amp + reach) * signs.leg;
      const flex = Math.max(0, Math.cos(t)) * g.knee[kind] * moving * signs.knee;
      const crouchUpper = c * (fore ? k.arm : k.thigh);
      const crouchLower = c * (fore ? k.forearm : k.shin);
      this._rot(upper, swing + crouchUpper);
      this._rot(lower, flex + crouchLower);
      this._rot(paw, -0.5 * (flex + crouchLower));
    }
    const breath = Math.sin(this._time * TAU * idle.breathRate) * idle.breath * (1 - moving);
    const flex = Math.sin(TAU * this.phase) * g.spineFlex * gallop * signs.spine;
    this._rot('spine1', flex + c * k.spine);
    this._rot('spine2', flex * 0.6 + breath);
    this._rot('chest', -flex * 0.3 - c * k.spine * 0.5);
    const roar = Math.sin(Math.min(1, this._roar * 1.4) * Math.PI) * 0.5;
    this._rot('neck', (-flex * g.neckCounter + c * k.head * 0.5 - roar * 0.6) * signs.neck);
    this._rot(
      'head',
      (c * k.head * 0.5 - roar * 0.5 + Math.sin(this._time * 30) * 0.03 * this._roar) * signs.neck,
    );
    // Tail: lifts and waves with the stride, sways slowly at rest, lashes in the standoff.
    const restSway = idle.tailSway * (1 - moving * 0.7) * (1 + c);
    for (let i = 0; i < TAIL.length; i++) {
      const wave = Math.sin(TAU * this.phase - i * g.tailLag);
      const lift = (g.tailLift * moving + wave * g.tailLift * moving * 0.5) * signs.tail;
      const sway =
        Math.sin(this._time * TAU * idle.tailRate * (1 + c) - i * 0.5) * restSway * 0.4 +
        wave * g.tailSway * moving * 0.3;
      this._rot(TAIL[i], lift, sway);
    }
    const bob = (g.bob + (g.gallopBob - g.bob) * gallop) * moving;
    this.model.position.y = Math.sin(TAU * this.phase * 2) * bob - c * k.drop;
  }

  _setLod(far) {
    this._lod = far;
    for (const mesh of this.mainMeshes) mesh.visible = !far || this.lodMeshes.length === 0;
    for (const mesh of this.lodMeshes) mesh.visible = far;
  }
}
