import { NpcActor } from '../ai/NpcActor.js';
import { TokBelang } from '../ai/TokBelang.js';
import { data } from '../core/Data.js';
import { EV } from '../core/events.js';
import { Tendrils } from '../render/Tendrils.js';

const DEG = Math.PI / 180;

/**
 * The story's cast in the current region (TECHNICAL §9): Tok Belang, the villagers (Adi, Mak Som), story props from
 * props/props_slice and Kelam's tendrils. Missions direct them through host actions (`tiger`, `npc`, `prop`,
 * `tendrils`); models load on first use (a `load` command starts the download without waiting), are compiled
 * before they appear, and are released when the region changes.
 */
export class StoryActors {
  /**
   * @param {object} options
   * @param {import('../core/Engine.js').Engine} options.engine
   * @param {(at: string|number[], offset?: number[]) => { x: number, y: number, z: number }} options.point
   *   resolves 'marker:x' / 'trigger:x' / [x, y, z]
   */
  constructor({ engine, point }) {
    this.engine = engine;
    this.point = point;
    /** @type {Map<string, Promise<any>>} character GLBs by manifest key */
    this._models = new Map();
    /** @type {Map<string, NpcActor>} */
    this.npcs = new Map();
    /** @type {Map<string, Promise<NpcActor>>} */
    this._npcLoads = new Map();
    /** @type {TokBelang|null} */
    this.tiger = null;
    this._tigerLoad = null;
    /** @type {Map<string, import('three').Object3D>} */
    this.props = new Map();
    /** @type {Tendrils|null} */
    this.tendrils = null;
    this._generation = 0;
  }

  /**
   * Tok Belang: `load`, `chase` (path, end), `standoff` (at), `roar`, `hide`.
   * @param {string} command
   * @param {object} action
   */
  async tigerCommand(command, action) {
    if (command === 'load') {
      this._tigerActor();
      return;
    }
    const tiger = await this._tigerActor();
    if (command === 'chase') {
      tiger.chase(this._path(action.path), action.end ? this._markerPose(action.end) : null);
    } else if (command === 'standoff') {
      const pose = this._markerPose(action.at);
      tiger.standoff(pose.position, pose.yaw);
    } else if (command === 'roar') tiger.roar();
    else if (command === 'hide') tiger.hide();
    else throw new Error(`StoryActors: unknown tiger command "${command}"`);
  }

  /**
   * A villager: `{ "npc": "adi", "do": "place"|"run"|"flee"|"hold"|"face"|"ink"|"hide"|"load", … }`.
   * @param {string} id
   * @param {object} action
   */
  async npcCommand(id, action) {
    const command = action.do;
    if (command === 'load') {
      this._npc(id);
      return;
    }
    const npc = await this._npc(id);
    const tuning = data('tuning/npc');
    if (command === 'place') {
      const p = this.point(action.at, action.offset);
      const marker = typeof action.at === 'string' ? this._markerPoseOrNull(action.at) : null;
      const yaw = action.yaw !== undefined ? action.yaw * DEG : (marker?.yaw ?? npc.yaw);
      npc.place(p, yaw);
    } else if (command === 'run') {
      const pace = tuning.paces[action.pace ?? 'jog'];
      if (!pace) throw new Error(`StoryActors: unknown pace "${action.pace}"`);
      npc.run(this._path(action.path), pace);
    } else if (command === 'flee') npc.flee(this._path(action.path));
    else if (command === 'hold') npc.hold(action.state ?? null);
    else if (command === 'face') npc.face(action.on !== false);
    else if (command === 'ink') npc.setInk(action.to ?? 1, action.seconds ?? 0);
    else if (command === 'hide') npc.hide();
    else throw new Error(`StoryActors: unknown npc command "${command}"`);
  }

  /**
   * A villager if it is loaded (races ask whether the rival has arrived).
   * @param {string} id
   * @returns {NpcActor|null}
   */
  npc(id) {
    return this.npcs.get(id) ?? null;
  }

  /**
   * Sets a prop from props/props_slice (found by node name) at a point, facing the marker's way. Placing the same
   * prop at the same point again does nothing, so mission setups can repeat it.
   * @param {string} name e.g. 'hikayat_open'
   * @param {string} at 'marker:x'
   */
  prop(name, at) {
    const key = `${name}@${at}`;
    if (this.props.has(key)) return;
    const source = this.engine.props?.scene.getObjectByName(name);
    if (!source) throw new Error(`StoryActors: no prop "${name}"`);
    const object = source.clone(true);
    const p = this.point(at);
    object.position.set(p.x, p.y, p.z);
    object.rotation.set(0, this._markerPoseOrNull(at)?.yaw ?? 0, 0);
    object.traverse((node) => {
      if (node.isMesh) node.frustumCulled = false;
    });
    this.engine.scene.add(object);
    this.props.set(key, object);
  }

  /**
   * Kelam's tendrils: `{ "tendrils": "rise", "path": "tendrils_jetty", "seconds": 3 }`, `{ "tendrils": "sink" }`.
   * @param {string} command
   * @param {object} action
   */
  tendrilsCommand(command, action) {
    if (command === 'rise') {
      if (!this.tendrils) {
        this.tendrils = new Tendrils(this._path(action.path));
        this.engine.scene.add(this.tendrils.mesh);
      }
      this.tendrils.rise(action.seconds ?? 2.5);
      if ((action.seconds ?? 2.5) > 0)
        this.engine.bus.emit(EV.SOUND, { id: 'kelam_rise', gain: -2, priority: 3 });
    } else if (command === 'sink') this.tendrils?.sink(action.seconds ?? 2);
    else throw new Error(`StoryActors: unknown tendrils command "${command}"`);
  }

  /**
   * @param {number} dt seconds
   * @param {{ x: number, y: number, z: number }} feet the player
   */
  update(dt, feet) {
    const camera = this.engine.camera;
    this.tiger?.update(dt, feet, camera);
    for (const npc of this.npcs.values()) npc.update(dt, feet, camera);
    this.tendrils?.update(dt);
  }

  /** Drops everything that belonged to the previous region (props, actors, effects) and releases their models. */
  clearRegion() {
    this._generation++;
    for (const object of this.props.values()) object.removeFromParent();
    this.props.clear();
    this.tiger?.dispose();
    this.tiger = null;
    this._tigerLoad = null;
    for (const npc of this.npcs.values()) npc.dispose();
    this.npcs.clear();
    this._npcLoads.clear();
    this.tendrils?.dispose();
    this.tendrils = null;
    const manifest = data('generated/assets').assets;
    for (const key of this._models.keys()) this.engine.assets.release(manifest[key].url);
    this._models.clear();
  }

  dispose() {
    this.clearRegion();
  }

  /** A character GLB by manifest key, loaded once per region (one reference held until `clearRegion`). */
  _model(key) {
    let load = this._models.get(key);
    if (!load) {
      const entry = data('generated/assets').assets[key];
      if (!entry) throw new Error(`StoryActors: no asset "${key}"`);
      load = this.engine.assets.loadAll([entry]).then((loaded) => loaded.get(entry.url));
      this._models.set(key, load);
    }
    return load;
  }

  /** Builds an actor's root, compiles its shaders while hidden, and checks the region did not change meanwhile. */
  async _prepare(root, generation) {
    const visible = root.visible;
    root.visible = true;
    await this.engine.renderer.three.compileAsync(root, this.engine.camera, this.engine.scene);
    root.visible = visible;
    return generation === this._generation;
  }

  _tigerActor() {
    if (this._tigerLoad) return this._tigerLoad;
    const generation = this._generation;
    this._tigerLoad = this._model('characters/tokbelang').then(async (gltf) => {
      const tiger = new TokBelang({ gltf, parent: this.engine.scene, tuning: data('tuning/tiger') });
      tiger.onSound = (id, gain) =>
        this.engine.bus.emit(EV.SOUND, { id, at: tiger.position, gain, ref: 8, priority: 3 });
      if (!(await this._prepare(tiger.root, generation))) {
        tiger.dispose();
        return tiger;
      }
      this.tiger = tiger;
      return tiger;
    });
    return this._tigerLoad;
  }

  _npc(id) {
    let load = this._npcLoads.get(id);
    if (load) return load;
    const tuning = data('tuning/npc');
    const model = tuning.models[id];
    if (!model) throw new Error(`StoryActors: no villager "${id}"`);
    const generation = this._generation;
    load = this._model(`characters/${model}`).then(async (gltf) => {
      const npc = new NpcActor({
        id,
        gltf,
        clips: this.engine.clips,
        profile: data('animation/human'),
        parent: this.engine.scene,
        tuning,
      });
      if (!(await this._prepare(npc.avatar.root, generation))) {
        npc.dispose();
        return npc;
      }
      this.npcs.set(id, npc);
      return npc;
    });
    this._npcLoads.set(id, load);
    return load;
  }

  _path(name) {
    const path = this.engine.world?.paths[name];
    if (!path) throw new Error(`StoryActors: no path "${name}"`);
    return path;
  }

  _markerPoseOrNull(at) {
    if (typeof at !== 'string' || !at.startsWith('marker:')) return null;
    const marker = this.engine.world?.markers[at.slice(7)];
    return marker ? { position: marker.p, yaw: marker.yaw } : null;
  }

  _markerPose(at) {
    const pose = this._markerPoseOrNull(at.includes(':') ? at : `marker:${at}`);
    if (!pose) throw new Error(`StoryActors: no marker "${at}"`);
    return pose;
  }
}
