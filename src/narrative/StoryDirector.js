import { data, dataKeys, lazyKeys, loadData } from '../core/Data.js';
import { EV } from '../core/events.js';
import { log } from '../core/Log.js';
import { KelipActor } from '../guidance/KelipActor.js';
import { KelipGuide } from '../guidance/KelipGuide.js';
import { MissionSystem } from '../missions/MissionSystem.js';
import { GuideTrail } from '../render/GuideTrail.js';
import { StoryUi } from '../ui/StoryUi.js';
import { Cutscenes } from './Cutscenes.js';
import { Dialogue } from './Dialogue.js';
import { StoryState } from './StoryState.js';

/** Longest frame the story's clocks count (seconds). */
const MAX_STORY_DT = 0.1;

/**
 * Runs the story (TECHNICAL §9): story state in the save, dialogue, cutscenes, missions, Kelip's call and Kelip
 * itself, checkpoints, and the engine actions missions use (encounters, teleports, light and tide, region changes).
 * The engine owns the world and the player; this owns what happens in them.
 */
export class StoryDirector {
  /**
   * Loads this slice's mission and dialogue files (small; later chapters can stream).
   * @returns {Promise<{ missions: Record<string, object>, dialogue: object }>}
   */
  static async loadData() {
    const missions = {};
    for (const key of lazyKeys('missions/')) {
      const mission = await loadData(key);
      missions[mission.id] = mission;
    }
    const dialogue = { speakers: {}, lines: {} };
    for (const key of lazyKeys('dialogue/')) {
      const file = await loadData(key);
      Object.assign(dialogue.speakers, file.speakers ?? {});
      Object.assign(dialogue.lines, file.lines ?? {});
    }
    return { missions, dialogue };
  }

  /**
   * @param {object} options
   * @param {import('../core/Engine.js').Engine} options.engine
   * @param {{ missions: Record<string, object>, dialogue: object }} options.content from `loadData`
   * @param {{ scene: import('three').Object3D }|null} options.kelipModel characters/kelip
   */
  constructor({ engine, content, kelipModel }) {
    this.engine = engine;
    const { bus, input, i18n, settings } = engine;
    this.bus = bus;
    this.story = new StoryState({ bus, doc: engine.saveDoc });
    this.dialogue = new Dialogue({ bus, i18n, data: content.dialogue });
    const scenes = sceneData();
    this.cutscenes = new Cutscenes({
      bus,
      input,
      camera: engine.cameraSystem,
      dialogue: this.dialogue,
      resolve: (point) => this.missions._point(point),
      run: (actions) => this.missions.run(actions),
    });
    this.missions = new MissionSystem({
      bus,
      story: this.story,
      dialogue: this.dialogue,
      cutscenes: this.cutscenes,
      input,
      missions: content.missions,
      scenes,
      bufferTicks: engine.time.secondsToTicks(data('tuning/player').jump.bufferTime),
      host: {
        world: () => engine.world,
        region: () => engine.sceneId,
        feet: () => engine._currentFeet(),
        actions: this._actions(),
      },
    });
    this.trail = new GuideTrail();
    engine.scene.add(this.trail.mesh);
    this.kelip = kelipModel
      ? new KelipActor({ gltf: kelipModel, parent: engine.scene, dayNight: this._dayNight() })
      : null;
    this.guide = new KelipGuide({
      bus,
      input,
      missions: this.missions,
      feet: () => engine._currentFeet(),
      wave: (origin, target) => {
        engine.world?.fireflies?.wave(origin, target);
        this.trail.call(origin, target);
        this.kelip?.dart(target);
      },
      tuning: data('tuning/guide'),
    });
    this.ui = new StoryUi({ root: engine.uiRoot, bus, i18n, input, settings });
    this._tide = null;
    /** @type {Map<string, import('three').Object3D>} story props placed in the current region */
    this._props = new Map();
    this._off = [
      bus.on(EV.STORY_FLAG, ({ name, value }) => {
        if (name === 'kelip_awake' && this.kelip && !value) this.kelip.setVisible(false);
      }),
      bus.on(EV.REGION_READY, () => this._regionReady()),
    ];
  }

  /** Whether a cutscene holds control (the engine keeps Bayu still). */
  get blocking() {
    return this.cutscenes.active !== null;
  }

  /**
   * Starts (or resumes) a mission; Kelip is at Bayu's side if it has already risen.
   * @param {string} id
   * @param {string|null} [step]
   * @returns {Promise<void>}
   */
  start(id, step = null) {
    if (this.story.get('kelip_awake') && this.kelip && !this.kelip.visible) {
      this.kelip.setVisible(true, this.engine._currentFeet());
    }
    return this.missions.start(id, step).catch((error) => log.add('error', `Story: ${error.message}`, error));
  }

  /**
   * @param {number} dt
   */
  fixedUpdate(dt) {
    if (this.blocking) return;
    this.missions.fixedUpdate(dt);
    this.guide.fixedUpdate(dt);
  }

  /**
   * @param {number} frameDt real seconds
   * @param {number} now real clock
   * @param {{ x: number, y: number, z: number }} feet
   * @param {number} facing
   */
  frameUpdate(frameDt, now, feet, facing) {
    // A hitch (first frames, a region load) must not eat a line, a prompt or half a cutscene.
    const dt = Math.min(frameDt, MAX_STORY_DT);
    this.dialogue.update(dt);
    this.cutscenes.update(dt);
    this.ui.update(dt);
    this.trail.update(now);
    this.kelip?.update(dt, feet, facing, now);
    if (this._tide) {
      const t = this._tide;
      t.time += dt;
      const u = Math.min(1, t.time / t.seconds);
      this.engine.world?.setWaterLevel(t.from + (t.to - t.from) * u);
      if (u >= 1) this._tide = null;
    }
  }

  dispose() {
    for (const off of this._off) off();
    this.missions.dispose();
    this.ui.dispose();
    this.trail.dispose();
    this.kelip?.dispose();
    for (const object of this._props.values()) object.removeFromParent();
  }

  _dayNight() {
    return this.engine.world?.dayNight ?? { addLamp: (lamp) => ({ ...lamp, phase: 0 }) };
  }

  _regionReady() {
    // The old region's story props went with it.
    for (const object of this._props.values()) object.removeFromParent();
    this._props.clear();
    // The new region has a new lamp pool: give Kelip's light to it.
    if (!this.kelip || !this.engine.world) return;
    this.kelip.lamp = this.engine.world.dayNight.addLamp({
      position: this.kelip.lamp.position,
      kind: 'kelip',
      intensity: this.kelip.visible ? 1 : 0,
    });
  }

  /**
   * Sets a prop from props/props_slice (found by node name) at a marker, facing the marker's way. Placing the same
   * prop at the same point again does nothing, so mission setups can repeat it.
   * @param {string} name e.g. 'hikayat_open'
   * @param {string} at 'marker:x'
   */
  _placeProp(name, at) {
    const key = `${name}@${at}`;
    if (this._props.has(key)) return;
    const source = this.engine.props?.scene.getObjectByName(name);
    if (!source) throw new Error(`StoryDirector: no prop "${name}"`);
    const object = source.clone(true);
    const p = this.missions._point({ at });
    object.position.set(p.x, p.y, p.z);
    const marker = at.startsWith('marker:') ? this.engine.world?.markers[at.slice(7)] : null;
    object.rotation.set(0, marker?.yaw ?? 0, 0);
    object.traverse((node) => {
      if (node.isMesh) node.frustumCulled = false;
    });
    this.engine.scene.add(object);
    this._props.set(key, object);
  }

  /** Engine-side effects for mission actions. */
  _actions() {
    const engine = this.engine;
    return {
      encounter: (id) => engine.encounters.start(id),
      teleport: (point, yaw) => engine.placePlayer(point, yaw),
      autosave: (at) => engine.checkpoint(at),
      kelipWave: (target) => this.guide.call(target),
      prompt: (action, text) => this.bus.emit(EV.PROMPT, { action, text }),
      light: (name, seconds) => {
        const dayNight = engine.world?.dayNight;
        if (!dayNight) return;
        if (seconds > 0) dayNight.blendTo(name, seconds);
        else dayNight.set(name);
      },
      water: (level, seconds) => {
        const world = engine.world;
        if (!world) return;
        if (!seconds) world.setWaterLevel(level);
        else this._tide = { from: world.waterLevel, to: level, seconds, time: 0 };
      },
      ability: (name) => engine.abilities.grant(name),
      abilities: (set) => engine.abilities.useSet(set),
      region: (id, marker) => engine.changeRegion(id, marker),
      /** The fireflies go out row by row: `{ "darken": [x, z], "seconds": s, "to"?: front }` (Fireflies.darken). */
      darken: (dir, action) =>
        engine.world?.fireflies?.darken({ x: dir[0], z: dir[1] }, action.seconds ?? 0, action.to),
      /** Every firefly lights again (a Pelita relit). */
      relight: (seconds) => engine.world?.fireflies?.relight(Number(seconds) || 0),
      /** Cut to black (true) or back (false). */
      fade: (dark) => this.bus.emit(EV.SCREEN_FADE, { dark: !!dark }),
      /** A chapter title card: `title: 'chapter.1'` shows chapter.1.kicker and chapter.1.title. */
      title: (key) => this.bus.emit(EV.TITLE_CARD, { kicker: `${key}.kicker`, title: `${key}.title` }),
      /** Kelip rises out of the hikayat (5:00) and stays at Bayu's side. */
      kelipRise: (marker) => {
        this.story.set('kelip_awake', true);
        this.kelip?.rise(this.missions._point({ at: marker }), 2.6);
      },
      /** A story prop from props/props_slice set in the world: `{ "prop": "hikayat_open", "at": "marker:hikayat" }`. */
      prop: (name, action) => this._placeProp(name, action.at),
    };
  }
}

/** Cutscene definitions are small and bundled with the game (data/cutscenes/*.json), keyed by id. */
function sceneData() {
  const scenes = {};
  for (const key of dataKeys()) {
    if (!key.startsWith('cutscenes/')) continue;
    const def = data(key);
    scenes[def.id] = def;
  }
  return scenes;
}
