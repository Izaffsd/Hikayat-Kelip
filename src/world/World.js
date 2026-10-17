import { Group, Vector3 } from 'three/webgpu';
import { data, loadData } from '../core/Data.js';
import { DayNight } from './DayNight.js';
import { Fireflies } from './Fireflies.js';
import { LevelBuilder } from './LevelBuilder.js';
import { Rain } from './Rain.js';
import { Sky } from './Sky.js';
import { Terrain } from './Terrain.js';
import { insideTrigger } from './triggers.js';
import { Water } from './Water.js';

/** Thin kit pieces the camera passes through (TECHNICAL §7: posts and ropes never shove the camera). */
const DEFAULT_NO_CAMERA_BLOCK = [
  'post',
  'post_snapped',
  'railing_3',
  'bollard',
  'washing_line',
  'net_rack',
  'pelita_post',
  'pondok_kelip',
  'tempayan',
  'crate',
  'akar_napas',
  'nipah_clump',
  'debris_planks',
];

/**
 * One loaded region (TECHNICAL §4.2, the RegionManager for the vertical slice): reads `data/regions/<id>.json`
 * (layout produced by tools/layout), loads its kits through the AssetLoader, and builds terrain, water, sky,
 * lighting, the instanced kit, lamps, fireflies and weather. Gameplay reads markers, paths and triggers from it.
 */
export class World {
  /**
   * @param {object} options
   * @param {import('three').Scene} options.scene
   * @param {import('../physics/PhysicsWorld.js').PhysicsWorld} options.physics
   * @param {import('../core/AssetLoader.js').AssetLoader} options.assets
   * @param {import('../render/Renderer.js').Renderer} options.renderer
   * @param {import('../core/EventBus.js').EventBus} options.bus
   * @param {object} options.preset current quality preset
   */
  constructor({ scene, physics, assets, renderer, bus, preset }) {
    Object.assign(this, { scene, physics, assets, renderer, bus, preset });
    this.root = new Group();
    this.root.name = 'World';
    this.region = null;
    /** @type {Record<string, { p: Vector3, yaw: number }>} */
    this.markers = {};
    /** @type {Record<string, Vector3[]>} */
    this.paths = {};
    this.triggers = [];
    this.deadlyWater = true;
  }

  /**
   * Loads and builds a region.
   * @param {string} id
   * @param {(fraction: number) => void} [onProgress]
   */
  async load(id, onProgress = () => {}) {
    const region = await loadData(`regions/${id}`);
    this.region = region;
    const manifest = data('generated/assets').assets;
    const kitEntries = region.kits.map((key) => {
      if (!manifest[key]) throw new Error(`Region ${id} needs unknown asset ${key}`);
      return manifest[key];
    });
    const loaded = await this.assets.loadAll(kitEntries, (done, total) => onProgress(done / total));
    this._kitUrls = kitEntries.map((entry) => entry.url);
    const pieces = new Map();
    for (const entry of kitEntries) {
      for (const [name, piece] of LevelBuilder.indexKit(loaded.get(entry.url))) pieces.set(name, piece);
    }

    this.scene.add(this.root);
    this.sky = new Sky();
    this.root.add(this.sky.mesh);
    this.water = region.water ? new Water(region.water) : null;
    if (this.water) this.root.add(this.water.mesh);
    this.deadlyWater = region.water?.deadly !== false;
    this.terrain = region.terrain
      ? new Terrain(region.terrain, this.physics, region.water?.level ?? -10)
      : null;
    if (this.terrain) this.root.add(this.terrain.mesh);

    this.builder = new LevelBuilder({
      physics: this.physics,
      noCameraBlock: new Set(region.noCameraBlock ?? DEFAULT_NO_CAMERA_BLOCK),
    });
    const { root, lights } = this.builder.buildPlacements(pieces, region.placements);
    this.root.add(root);
    this.builder.addBoxes(region.boxes ?? []);

    this.dayNight = new DayNight({
      scene: this.scene,
      sky: this.sky,
      water: this.water,
      renderer: this.renderer,
      bus: this.bus,
      lampLights: this.preset.shadows === 'blob' ? 2 : 4,
    });
    this.dayNight.set(region.light ?? 'night');
    this.dayNight.setLamps([
      ...lights,
      ...(region.lamps ?? []).map((lamp) => ({ kind: lamp.kind, position: new Vector3(...lamp.p) })),
    ]);

    if (region.fireflies?.length) {
      this.fireflies = new Fireflies({ groups: region.fireflies, count: this.preset.fireflies });
      this.root.add(this.fireflies.mesh);
    }
    if (region.weather === 'storm') {
      this.rain = new Rain({ count: Math.round(this.preset.fireflies * 0.3) });
      this.root.add(this.rain.mesh);
      if (this.water) this.water.uniforms.rain.value = 1;
    }

    this.markers = {};
    for (const [name, marker] of Object.entries(region.markers ?? {})) {
      this.markers[name] = { p: new Vector3(...marker.p), yaw: ((marker.yaw ?? 0) * Math.PI) / 180 };
    }
    this.paths = {};
    for (const [name, points] of Object.entries(region.paths ?? {})) {
      this.paths[name] = points.map((point) => new Vector3(...point));
    }
    this.triggers = (region.triggers ?? []).map((trigger) => ({
      id: trigger.id,
      center: new Vector3(...trigger.c),
      half: trigger.h ? new Vector3(...trigger.h) : null,
      radius: trigger.r ?? 0,
    }));
  }

  /** Current water surface height (tide and flood move it). */
  get waterLevel() {
    return this.water ? this.water.level : -1e9;
  }

  /**
   * @param {number} level
   */
  setWaterLevel(level) {
    this.water?.setLevel(level);
    this.terrain?.setWaterLevel(level);
  }

  /**
   * Tags of the kit piece a collider belongs to.
   * @param {any} collider
   * @returns {string[]}
   */
  tagsOf(collider) {
    return this.builder ? this.builder.tagsOf(collider) : [];
  }

  /**
   * Whether a point is inside a trigger.
   * @param {{ center: Vector3, half: Vector3|null, radius: number }} trigger
   * @param {{ x: number, y: number, z: number }} p
   * @returns {boolean}
   */
  static inside(trigger, p) {
    return insideTrigger(trigger, p);
  }

  /**
   * @param {number} dt
   * @param {import('three').Camera} camera
   * @param {Vector3} focus the player
   */
  update(dt, camera, focus) {
    this.sky.follow(camera);
    this.dayNight.update(dt, focus);
    this.fireflies?.update(dt);
  }

  /** Frees GPU resources and colliders; releases the kit GLBs. */
  dispose() {
    this.root.removeFromParent();
    this.sky?.dispose();
    this.water?.dispose();
    this.terrain?.dispose();
    this.fireflies?.dispose();
    this.rain?.dispose();
    this.dayNight?.dispose();
    this.builder?.dispose();
    for (const url of this._kitUrls ?? []) this.assets.release(url);
  }
}
