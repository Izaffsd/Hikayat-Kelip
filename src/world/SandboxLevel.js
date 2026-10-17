import {
  BoxGeometry,
  CapsuleGeometry,
  Color,
  DirectionalLight,
  Fog,
  Group,
  HemisphereLight,
  InstancedMesh,
  Matrix4,
  Mesh,
  MeshBasicNodeMaterial,
  MeshStandardNodeMaterial,
  PlaneGeometry,
  PointLight,
  Quaternion,
  SphereGeometry,
  Vector3,
} from 'three/webgpu';
import {
  color,
  float,
  floor,
  fract,
  instanceIndex,
  max,
  mix,
  mod,
  positionLocal,
  positionWorld,
  sin,
  step,
  time,
  vec3,
} from 'three/tsl';
import { GROUP, interactionGroups } from '../physics/PhysicsWorld.js';

const DEG = Math.PI / 180;

/**
 * Phase 1 movement sandbox: a test course for the controller, camera and both render backends.
 * Contains step heights around the autostep limit, ramps around the slope limit, gap jumps, a stilt
 * platform with stairs, a long wall (future wall-run), a low roof (camera collision) and glowing orbs
 * (bloom check). Replaced by the real prologue in Phase 3; kept as a debug scene (`?scene=sandbox`).
 */
export class SandboxLevel {
  /**
   * @param {object} options
   * @param {import('three').Scene} options.scene
   * @param {import('../physics/PhysicsWorld.js').PhysicsWorld} options.physics
   */
  constructor({ scene, physics }) {
    this.scene = scene;
    this.physics = physics;
    this.root = new Group();
    this.root.name = 'Sandbox';
    this._box = new BoxGeometry(1, 1, 1);
    this._materials = {
      stone: makeMaterial(0x4a5468, 0.9),
      wood: makeMaterial(0x7a5a3c, 0.85),
      roof: makeMaterial(0x5b3a2a, 0.9),
      accent: makeMaterial(0xa8743a, 0.7),
    };
    this._q = new Quaternion();
    this._xAxis = new Vector3(1, 0, 0);
  }

  /**
   * Builds meshes, colliders and lights.
   * @returns {{ spawn: { x: number, y: number, z: number }, facing: number }}
   */
  build() {
    const scene = this.scene;
    scene.background = new Color(0x0b1020);
    scene.fog = new Fog(0x0b1020, 45, 170);
    scene.add(this.root);

    const hemi = new HemisphereLight(0x5f7fc8, 0x141a2c, 1.35);
    this.root.add(hemi);
    const moon = new DirectionalLight(0xd6defc, 1.6);
    moon.position.set(30, 50, 22);
    this.root.add(moon);
    const lantern = new PointLight(0xe8952f, 30, 14, 1.6);
    lantern.position.set(12, 4.2, 0);
    this.root.add(lantern);

    this._ground();

    // Edge heights: up to 0.42 m step up, up to 1.3 m mantle, 1.4 and 2.0 m need a jump and a ledge grab.
    const steps = [0.15, 0.3, 0.45, 0.6, 1.0, 1.4, 2.0];
    steps.forEach((h, i) => this.box('stone', -10 + i * 3.2, h / 2, -10, 2, h, 2));

    // Ramps: 20° and 40° are climbable; 55° exceeds the 50° limit and slides.
    [20, 40, 55].forEach((deg, i) => this.ramp(-8 + i * 6, 10, deg));

    // Stilt platform with stairs (rise 0.25 m per step).
    this.box('wood', 12, 2.35, 0, 6, 0.3, 6);
    for (const [px, pz] of [
      [9.4, -2.6],
      [14.6, -2.6],
      [9.4, 2.6],
      [14.6, 2.6],
    ]) {
      this.box('wood', px, 1.1, pz, 0.3, 2.2, 0.3, false);
    }
    // Solid steps descending west from the platform edge (x = 9): rise 0.25 m, run 0.42 m.
    for (let k = 0; k < 9; k++) {
      const top = 2.25 - k * 0.25;
      this.box('wood', 8.79 - k * 0.42, top / 2, 0, 0.42, top, 2);
    }
    this.box('roof', 12, 4.9, 0, 6.6, 0.2, 6.6);

    // Gap jumps between platforms at 1 m: gaps of 1.5, 2.5, 3.5 and 4.5 m.
    let x = -14;
    for (const gap of [0, 1.5, 2.5, 3.5, 4.5]) {
      x += gap;
      this.box('accent', x + 1, 0.5, 22, 2, 1, 3);
      x += 2;
    }

    // Long wall (future wall-run) and a low roof for camera collision.
    this.box('stone', -20, 2, 0, 0.4, 4, 20);
    this.box('roof', 2, 2.3, -22, 6, 0.3, 4);
    this.box('stone', -0.8, 1.15, -22, 0.4, 2.3, 4, false);
    this.box('stone', 4.8, 1.15, -22, 0.4, 2.3, 4, false);

    this._orbs();

    return { spawn: { x: 0, y: 0, z: 4 }, facing: Math.PI };
  }

  /**
   * Adds a box mesh with a matching static collider.
   * @param {keyof SandboxLevel['_materials']} material
   * @param {number} x centre
   * @param {number} y centre
   * @param {number} z centre
   * @param {number} sx size
   * @param {number} sy
   * @param {number} sz
   * @param {boolean} [blocksCamera=true]
   * @param {{ x: number, y: number, z: number, w: number }} [rotation]
   * @returns {Mesh}
   */
  box(material, x, y, z, sx, sy, sz, blocksCamera = true, rotation) {
    const mesh = new Mesh(this._box, this._materials[material]);
    mesh.position.set(x, y, z);
    mesh.scale.set(sx, sy, sz);
    if (rotation) mesh.quaternion.set(rotation.x, rotation.y, rotation.z, rotation.w);
    this.root.add(mesh);
    const filter = blocksCamera ? GROUP.ALL : GROUP.ALL & ~GROUP.CAMERA;
    this.physics.addStaticBox(
      { x, y, z },
      { x: sx / 2, y: sy / 2, z: sz / 2 },
      { rotation, groups: interactionGroups(GROUP.WORLD, filter) },
    );
    return mesh;
  }

  /**
   * A ramp rising toward −Z whose low edge rests on the ground.
   * @param {number} x
   * @param {number} z low-edge position
   * @param {number} degrees slope angle
   */
  ramp(x, z, degrees) {
    const length = 6;
    const thickness = 0.3;
    const angle = degrees * DEG;
    this._q.setFromAxisAngle(this._xAxis, angle);
    const cy = (Math.sin(angle) * length) / 2 - (Math.cos(angle) * thickness) / 2 + 0.01;
    const cz = z - (Math.cos(angle) * length) / 2 - (Math.sin(angle) * thickness) / 2;
    this.box('stone', x, cy, cz, 3, thickness, length, true, {
      x: this._q.x,
      y: this._q.y,
      z: this._q.z,
      w: this._q.w,
    });
  }

  _ground() {
    const material = new MeshStandardNodeMaterial({ roughness: 0.95, metalness: 0 });
    const tile = positionWorld.xz.mul(0.5);
    const checker = mod(floor(tile.x).add(floor(tile.y)), 2.0);
    const base = mix(color(0x2a3244), color(0x323c50), checker);
    const grid = fract(positionWorld.xz);
    const line = max(step(0.975, grid.x), step(0.975, grid.y));
    material.colorNode = mix(base, color(0x56627e), line.mul(0.6));
    const ground = new Mesh(new PlaneGeometry(160, 160), material);
    ground.rotation.x = -Math.PI / 2;
    this.root.add(ground);
    this.physics.addStaticBox({ x: 0, y: -0.5, z: 0 }, { x: 80, y: 0.5, z: 80 });
  }

  _orbs() {
    const count = 48;
    const material = new MeshBasicNodeMaterial();
    material.colorNode = color(0xd8f06a).mul(2.4);
    const bob = sin(time.mul(1.4).add(float(instanceIndex).mul(1.7))).mul(0.3);
    material.positionNode = positionLocal.add(vec3(0, bob, 0));
    const orbs = new InstancedMesh(new SphereGeometry(0.09, 10, 8), material, count);
    const m = new Matrix4();
    let seed = 7;
    const random = () => {
      seed = (seed * 16807) % 2147483647;
      return (seed - 1) / 2147483646;
    };
    for (let i = 0; i < count; i++) {
      m.makeTranslation((random() - 0.5) * 50, 1.2 + random() * 3.5, (random() - 0.5) * 50);
      orbs.setMatrixAt(i, m);
    }
    orbs.frustumCulled = false;
    this.root.add(orbs);
  }

  /**
   * A simple capsule avatar with a "nose" showing facing (until Bayu's model arrives in Phase 2).
   * @returns {Group}
   */
  static createAvatar() {
    const avatar = new Group();
    avatar.name = 'PlayerAvatar';
    const body = new Mesh(new CapsuleGeometry(0.3, 1.0, 6, 14), makeMaterial(0xe8952f, 0.6));
    body.position.y = 0.8;
    avatar.add(body);
    const nose = new Mesh(new BoxGeometry(0.16, 0.12, 0.22), makeMaterial(0xf6eedf, 0.5));
    nose.position.set(0, 1.35, 0.3);
    avatar.add(nose);
    return avatar;
  }
}

/**
 * @param {number} hex
 * @param {number} roughness
 * @returns {MeshStandardNodeMaterial}
 */
function makeMaterial(hex, roughness) {
  return new MeshStandardNodeMaterial({ color: hex, roughness, metalness: 0 });
}
