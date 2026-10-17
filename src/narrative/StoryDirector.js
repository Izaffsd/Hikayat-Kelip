import { data, dataKeys, lazyKeys, loadData } from '../core/Data.js';
import { EV } from '../core/events.js';
import { log } from '../core/Log.js';
import { Vector3 } from 'three/webgpu';
import { RaceTimer } from '../competitive/RaceTimer.js';
import { KelipActor } from '../guidance/KelipActor.js';
import { KelipGuide } from '../guidance/KelipGuide.js';
import { MissionSystem } from '../missions/MissionSystem.js';
import { GuideTrail } from '../render/GuideTrail.js';
import { RaceHud } from '../ui/RaceHud.js';
import { StoryUi } from '../ui/StoryUi.js';
import { Cutscenes } from './Cutscenes.js';
import { Dialogue } from './Dialogue.js';
import { StoryActors } from './StoryActors.js';
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
    this.actors = new StoryActors({
      engine,
      point: (at, offset) => this.missions._point({ at, offset }),
    });
    this.race = new RaceTimer({ bus, doc: engine.saveDoc });
    this.raceHud = new RaceHud({ root: engine.uiRoot, bus, i18n, timer: this.race });
    /** Whether a mission holds Bayu still (`hold` action: a race's "ready… go"). */
    this.holding = false;
    this._tide = null;
    this._off = [
      bus.on(EV.STORY_FLAG, ({ name, value }) => {
        if (name === 'kelip_awake' && this.kelip && !value) this.kelip.setVisible(false);
      }),
      bus.on(EV.REGION_READY, () => this._regionReady()),
      bus.on(EV.CUTSCENE_ENDED, () => engine.setPose(null)),
      // Each mission starts defeatable and free to move; its setup can say otherwise.
      bus.on(EV.MISSION_STARTED, () => {
        engine.combat.minHealth = 0;
        this.holding = false;
      }),
    ];
  }

  /** Whether a cutscene holds control (the engine keeps Bayu still and swallows presses). */
  get blocking() {
    return this.cutscenes.active !== null;
  }

  /** Whether Bayu must stand still: a cutscene or a mission's hold. */
  get still() {
    return this.holding || this.blocking;
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
   * Starts a mission again at a step (pause → Restart from checkpoint): the scene, lines and race in progress are
   * dropped and the mission's setup and the step's resume actions rebuild the state.
   * @param {string} id
   * @param {string|null} step
   * @returns {Promise<void>}
   */
  restart(id, step) {
    this.cutscenes.cancel();
    this.dialogue.clear();
    this.race.cancel();
    this.holding = false;
    this.engine.setPose(null);
    return this.start(id, step);
  }

  /**
   * @param {number} dt
   */
  fixedUpdate(dt) {
    if (this.blocking) return;
    this.race.fixedUpdate(dt);
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
    this.actors.update(dt, feet);
    this.raceHud.update(dt);
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
    this.actors.dispose();
    this.raceHud.dispose();
  }

  /** Tok Belang when loaded (tests, diagnostics). */
  get tiger() {
    return this.actors.tiger;
  }

  _dayNight() {
    return this.engine.world?.dayNight ?? { addLamp: (lamp) => ({ ...lamp, phase: 0 }) };
  }

  _regionReady() {
    // The old region's cast, props and effects went with it; a race cannot continue across regions.
    this.actors.clearRegion();
    this.race.cancel();
    // The new region has a new lamp pool: give Kelip's light to it.
    if (!this.kelip || !this.engine.world) return;
    this.kelip.lamp = this.engine.world.dayNight.addLamp({
      position: this.kelip.lamp.position,
      kind: 'kelip',
      intensity: this.kelip.visible ? 1 : 0,
    });
  }

  /**
   * The end of a race: Bayu won if the rival has not reached the end of its path; the rival says the matching line.
   * @param {{ rival?: string, win?: string, lose?: string }} action
   */
  _finishRace(action) {
    const rival = action.rival ? this.actors.npc(action.rival) : null;
    const won = !rival || !rival.arrived;
    const result = this.race.finish(won);
    if (!result) return;
    this.story.set(`race_${result.id}_won`, won);
    if (won) this.engine.achievements.unlock('lebih_laju');
    const line = won ? action.win : action.lose;
    if (line) this.dialogue.say(line);
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
      /** The player's character model: `{ "avatar": "bayu" }` (young Wan plays the prologue). */
      avatar: (key) => engine.setPlayerModel(key),
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
      prop: (name, action) => this.actors.prop(name, action.at),
      /**
       * Tok Belang: `load` (starts the download, does not wait), `{ "tiger": "chase", "path": "tiger", "end":
       * "marker:x" }`, `{ "tiger": "standoff", "at": "marker:x" }`, `roar`, `hide`.
       */
      tiger: (command, action) => this.actors.tigerCommand(command, action),
      /** A villager: `{ "npc": "adi", "do": "place"|"run"|"flee"|"hold"|"face"|"ink"|"hide"|"load", … }`. */
      npc: (id, action) => this.actors.npcCommand(id, action),
      /** Kelam's tendrils: `{ "tendrils": "rise", "path": "tendrils_jetty" }` or `{ "tendrils": "sink" }`. */
      tendrils: (command, action) => this.actors.tendrilsCommand(command, action),
      /**
       * The race clock: `{ "race": "start" }` (the current mission's race) or `{ "race": "finish", "rival": "adi",
       * "win": line, "lose": line }`.
       */
      race: (command, action) => {
        if (command === 'start') this.race.start(this.missions.mission?.id ?? 'race');
        else if (command === 'finish') this._finishRace(action);
        else throw new Error(`StoryDirector: unknown race command "${command}"`);
      },
      /** Earns an achievement (data/achievements.json): `{ "achievement": "bunyi_pertama" }`. */
      achievement: (id) => engine.achievements.unlock(id),
      /** Ends the fight on screen at once (a scene takes over from the freed boss): `{ "clearEnemies": true }`. */
      clearEnemies: () => {
        engine.director.stop();
        engine.enemyViews.clear();
      },
      /** `{ "hold": true }` keeps Bayu standing still (a race's "ready… go"); `false` lets him go. */
      hold: (on) => {
        this.holding = !!on;
      },
      /** A story light in the lamp pool: `{ "lamp": "pelita_air", "at": "marker:x", "offset"?: [x, y, z] }`. */
      lamp: (kind, action) => {
        const p = this.missions._point({ at: action.at, offset: action.offset });
        engine.world?.dayNight.addLamp({ position: new Vector3(p.x, p.y, p.z), kind, intensity: 1 });
      },
      /** `{ "undefeatable": true }`: hits land but health never empties (GDD: no failure before minute 8). */
      undefeatable: (on) => {
        engine.combat.minHealth = on ? 1 : 0;
      },
      /** A close lightning strike (storm only): `{ "lightning": 0.12 }` is the thunder's delay in seconds. */
      lightning: (delay) => engine.world?.dayNight.strike(Number(delay) || 0.15),
      /** Camera shake: `{ "shake": 0.4 }` (trauma 0..1; off with the shake setting or reduced motion). */
      shake: (amount) => engine.cameraSystem.addTrauma(Number(amount) || 0.3),
      /** Holds the player in an animation state during a scene (`{ "pose": "stance" }`); cleared when it ends. */
      pose: (state) => engine.setPose(state),
      /**
       * Music state: `{ "music": "danger" }` holds it for the mission (null = the region's default); inside a cutscene
       * it lasts until the scene ends.
       */
      music: (state) => this.bus.emit(EV.MUSIC, { state: state ?? null, scene: !!this.cutscenes.active }),
      /** A music stinger on the next beat: `{ "sting": "sting_kelam" }`. */
      sting: (id) => this.bus.emit(EV.MUSIC_STING, { id }),
      /** A one-shot: `{ "sound": "pondok_awaken", "at"?: "marker:x", "gain"?: dB }`. */
      sound: (id, action) =>
        this.bus.emit(EV.SOUND, {
          id,
          at: action.at ? this.missions._point({ at: action.at, offset: action.offset }) : null,
          gain: action.gain ?? 0,
          ref: action.ref,
          priority: 3,
        }),
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
