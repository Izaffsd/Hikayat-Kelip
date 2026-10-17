import { PerspectiveCamera, Scene, Vector3 } from 'three/webgpu';
import { CameraSystem } from '../camera/CameraSystem.js';
import { CharacterController } from '../physics/CharacterController.js';
import { PhysicsWorld } from '../physics/PhysicsWorld.js';
import { Abilities } from '../player/Abilities.js';
import { prepareClips } from '../player/Animator.js';
import { Avatar } from '../player/Avatar.js';
import { PlayerController } from '../player/Controller.js';
import { EnemyDirector } from '../ai/EnemyDirector.js';
import { EnemyViews } from '../ai/EnemyViews.js';
import { CombatSystem } from '../combat/CombatSystem.js';
import { Encounters } from '../combat/Encounters.js';
import { Traversal } from '../player/Traversal.js';
import { Wau } from '../player/Wau.js';
import { MoteBurst } from '../render/MoteBurst.js';
import { CombatHud } from '../ui/CombatHud.js';
import { StoryDirector } from '../narrative/StoryDirector.js';
import { PostFX } from '../render/PostFX.js';
import { QualityManager } from '../render/QualityManager.js';
import { Renderer } from '../render/Renderer.js';
import { DebugOverlay } from '../ui/DebugOverlay.js';
import { ScreenFade } from '../ui/ScreenFade.js';
import { TouchControls } from '../ui/touch/TouchControls.js';
import { SandboxLevel } from '../world/SandboxLevel.js';
import { World } from '../world/World.js';
import { AssetLoader } from './AssetLoader.js';
import { data, loadData } from './Data.js';
import { EV } from './events.js';
import { Input } from './Input.js';
import { log } from './Log.js';
import { Loop } from './Loop.js';
import { PerfMonitor } from './PerfMonitor.js';
import { isPortrait } from './Platform.js';
import { SaveManager } from './SaveManager.js';
import { Telemetry, telemetryAllowed } from './Telemetry.js';
import { Time } from './Time.js';

const TELEMETRY_FPS_INTERVAL = 60;

/** Character model per enemy archetype (data/combat/enemies.json). */
const ENEMY_MODELS = { wisp: 'characters/wisp', brawler: 'characters/villager_man', adi: 'characters/adi' };

/** Milliseconds for the screen to go dark before a region is swapped (the fade's fast duration, rounded up). */
const REGION_FADE_MS = 260;

/** Intent of a player standing still (cutscenes). */
const STILL = Object.freeze({ x: 0, z: 0, magnitude: 0, sprintHeld: false });

/**
 * @param {number} value
 * @returns {number} rounded to centimetres (save positions)
 */
const round2 = (value) => Math.round(value * 100) / 100;

/** Gameplay presses swallowed while a cutscene holds control (holding them skips it instead). */
const CUTSCENE_SWALLOW = [
  'jump',
  'strike',
  'heavy',
  'langkah',
  'tangkis',
  'slide',
  'context',
  'kelip',
  'lockon',
];

/**
 * Manifest keys of the enemy models a region's encounters use (the prologue needs just the wisp).
 * @param {Record<string, any>} defs data/encounters.json
 * @param {string} regionId
 * @returns {Set<string>}
 */
function enemyModelKeys(defs, regionId) {
  const keys = new Set();
  for (const [id, def] of Object.entries(defs)) {
    if (id === 'comment' || def.region !== regionId) continue;
    for (const spawn of def.spawns) keys.add(ENEMY_MODELS[spawn.archetype]);
  }
  return keys;
}

/**
 * Owns every runtime system and the frame/tick order (TECHNICAL §2.2). Core services that the title
 * screen also needs (bus, settings, i18n, platform, storage, audio) are created in main.js and passed in.
 */
export class Engine {
  /**
   * @param {object} services
   * @param {HTMLCanvasElement} services.canvas
   * @param {HTMLElement} services.uiRoot
   * @param {HTMLElement} services.touchRoot
   * @param {import('./EventBus.js').EventBus} services.bus
   * @param {import('./Settings.js').Settings} services.settings
   * @param {import('./I18n.js').I18n} services.i18n
   * @param {import('./Platform.js').PlatformInfo} services.platform
   * @param {import('./storage.js').KeyValueStorage} services.storage
   * @param {import('../audio/AudioManager.js').AudioManager} services.audio
   */
  constructor(services) {
    Object.assign(this, services);
    this.time = new Time(60);
    this.perf = new PerfMonitor(600);
    this.started = false;
    this.portraitBlocked = false;
    this._feet = new Vector3();
    this._tickFeet = { x: 0, y: 0, z: 0 };
    this._down = { x: 0, y: -1, z: 0 };
    this._probe = { x: 0, y: 0, z: 0 };
    this.groundY = 0;
    this._frameStartMs = 0;
    this._fpsTimer = 0;
    this._resizeQueued = false;
  }

  /**
   * Initialises renderer, physics, content and shaders, reporting progress 0..1.
   * @param {(fraction: number) => void} onProgress
   */
  async boot(onProgress) {
    const { bus, settings, platform, canvas } = this;
    const query = platform.query;
    const forceWebGL =
      query.get('webgl') === '1' ||
      (query.get('webgl') !== '0' && settings.get('graphics.forceWebGL') === true);

    onProgress(0.05);
    this.renderer = await Renderer.create({ canvas, forceWebGL, bus });
    onProgress(0.25);
    this.physics = await PhysicsWorld.create();
    onProgress(0.35);
    this.assets = new AssetLoader({
      renderer: this.renderer.three,
      basisPath: `/vendor/three-${__THREE_VERSION__}/basis/`,
    });
    // Where play starts: `?mission=<id>` starts a mission; `?scene=<id>` loads a region with no story (tests, free
    // roam, `sandbox` = the Phase 1 movement course); otherwise the save resumes (a new save starts the prologue).
    this.saves = new SaveManager({ storage: this.storage, bus });
    const loadedSave = this.saves.load();
    this.saveDoc = loadedSave.doc;
    if (loadedSave.status !== 'loaded' && loadedSave.status !== 'new')
      log.add('warn', `Save: ${loadedSave.status}`);
    if (!this.storage.available) log.add('warn', this.i18n.t('save.storageUnavailable'));
    this.storyContent = query.has('scene') ? null : await StoryDirector.loadData();
    this._storyStart = this.storyContent ? this._storyStartPoint(query) : null;
    this.sceneId = query.get('scene') ?? this._storyStart?.region ?? 'prologue';
    const encounterDefs = data('encounters');
    const enemyKeys = enemyModelKeys(encounterDefs, this.sceneId);
    const manifest = data('generated/assets').assets;
    const keys = [
      'anim/anim_core',
      'anim/anim_villager',
      'anim/anim_cursed',
      'characters/bayu',
      ...(this.storyContent ? ['characters/kelip'] : []),
      'props/props_slice',
      ...enemyKeys,
    ];
    const assets = await this.assets.loadAll(
      keys.map((key) => manifest[key]),
      (done, total) => onProgress(0.35 + (0.25 * done) / total),
    );
    const byKey = (key) => assets.get(manifest[key].url);
    this._enemyAssetUrls = [...enemyKeys].map((key) => manifest[key].url);
    this.clips = new Map();
    for (const pack of ['anim/anim_core', 'anim/anim_villager', 'anim/anim_cursed']) {
      for (const [name, clip] of prepareClips(byKey(pack).animations)) this.clips.set(name, clip);
    }
    const bayu = byKey('characters/bayu');
    const props = byKey('props/props_slice');
    onProgress(0.6);

    this.scene = new Scene();
    this.camera = new PerspectiveCamera(60, 1, 0.1, 600);
    this.quality = new QualityManager({
      renderer: this.renderer,
      settings,
      bus,
      config: data('quality'),
      platform,
    });
    this._resize();
    this.quality.apply();

    this.input = new Input({ bus, bindings: data('input/bindings'), overrides: settings.get('bindings') });
    this.input.attach({ window, canvas });
    if (platform.isTouch) this.input.device = 'touch';

    let spawn;
    let facing;
    if (this.sceneId === 'sandbox') {
      this.level = new SandboxLevel({ scene: this.scene, physics: this.physics });
      ({ spawn, facing } = this.level.build());
    } else {
      this.world = this._newWorld();
      await this.world.load(this.sceneId, (fraction) => onProgress(0.6 + fraction * 0.1));
      const marker = this.world.markers.spawn;
      spawn = { x: marker.p.x, y: marker.p.y, z: marker.p.z };
      facing = marker.yaw;
    }
    this.character = new CharacterController(this.physics, data('tuning/player'), spawn);
    this.abilities = new Abilities(data('abilities'));
    this.abilities.useSet(this._storyStart?.abilities ?? this.abilities.setForRegion(this.sceneId));
    this.traversal = new Traversal({
      character: this.character,
      tuning: data('tuning/player'),
      input: this.input,
      time: this.time,
      bus,
      physics: this.physics,
      abilities: this.abilities,
      tagsOf: this.world ? (collider) => this.world.tagsOf(collider) : null,
    });
    this.traversal.facing = this.traversal.prevFacing = facing;
    this.controller = new PlayerController(this.input);
    this.avatar = new Avatar({
      gltf: bayu,
      clips: this.clips,
      profile: data('animation/human'),
      name: 'Bayu',
    });
    this.avatar.addTo(this.scene);
    this.avatar.root.rotation.order = 'YXZ';
    this._lean = 0;
    this._pitch = 0;
    this.wau = new Wau({ gltf: props, avatar: this.avatar, config: data('animation/human').wau });
    bus.on(EV.PLAYER_GLIDE, ({ open }) => this.wau.setOpen(open));
    this.props = props;
    this._attachTongkat(props);

    // Silat: the enemy director, Bayu's combat, enemy visuals, the region's encounters.
    const combatData = data('combat/moves');
    this.director = new EnemyDirector({
      bus,
      archetypes: data('combat/enemies'),
      tokens: combatData.attackTokens[settings.get('assists.difficulty')] ?? 2,
    });
    this.combat = new CombatSystem({
      traversal: this.traversal,
      character: this.character,
      input: this.input,
      time: this.time,
      bus,
      data: combatData,
      abilities: this.abilities,
      director: this.director,
      settings,
    });
    this.motes = new MoteBurst();
    this.scene.add(this.motes.mesh);
    this.enemyViews = new EnemyViews({
      scene: this.scene,
      bus,
      director: this.director,
      models: this._enemyModels(enemyKeys, byKey),
      clips: this.clips,
      profile: data('animation/cursed'),
      motes: this.motes,
    });
    this.encounters = this._createEncounters();
    const engine = this;
    this._playerAdapter = {
      get feet() {
        return engine._currentFeet();
      },
      get dodgeOrigin() {
        return engine.combat.dodgeOrigin;
      },
      radius: this.character.radius,
      receiveStrike: (enemy) => this.combat.receiveStrike(enemy),
    };
    this._guardAnim = false;
    bus.on(EV.COMBAT_ACTION, (action) => this._playCombatAction(action));
    bus.on(EV.PLAYER_JUMPED, () => this.avatar.animator.setState('jumpStart', true));
    bus.on(EV.PLAYER_LANDED, ({ speed }) =>
      this.avatar.animator.setState(
        speed > data('tuning/player').hardLandingSpeed ? 'hardLand' : 'land',
        true,
      ),
    );
    bus.on(EV.PLAYER_MANTLE, ({ kind, duration }) => {
      if (kind === 'step') return;
      const clip = this.clips.get('climb_up_1m_rm');
      if (!clip) return;
      this.avatar.animator.playAction('climb_up_1m_rm', {
        duration,
        timeScale: clip.duration / duration,
        fadeIn: 0.06,
        fadeOut: 0.16,
      });
    });
    this.cameraSystem = new CameraSystem({
      camera: this.camera,
      physics: this.physics,
      input: this.input,
      settings,
      tuning: data('tuning/camera'),
    });
    this.cameraSystem.snapBehind(facing);
    this.fade = new ScreenFade({ root: this.uiRoot, bus });
    this.story = this.storyContent
      ? new StoryDirector({ engine: this, content: this.storyContent, kelipModel: byKey('characters/kelip') })
      : null;
    this.postfx = new PostFX(this.renderer);
    this.postfx.build(this.scene, this.camera, this.quality.preset);
    onProgress(0.75);

    // Warm up shaders behind the title so the first gameplay frame does not hitch.
    this.character.interpolatedFeet(1, this._feet);
    this.avatar.root.position.copy(this._feet);
    this.avatar.update(0, this.camera, this._feet.y);
    this.cameraSystem.update(0, this._feet, facing, 0);
    await this.renderer.three.compileAsync(this.scene, this.camera);
    onProgress(0.95);

    this.telemetry = new Telemetry({
      enabled: telemetryAllowed({
        settingEnabled: settings.get('telemetry'),
        production: import.meta.env.PROD,
      }),
      build: __BUILD_ID__,
    });

    this.loop = new Loop({
      time: this.time,
      onFrameStart: (dt) => this._frameStart(dt),
      onFixed: (dt) => this._fixed(dt),
      onFrame: (dt) => this._frame(dt),
    });
    this.loop.setFpsCap(this.quality.fpsCap);

    this._createUi();
    this._bindPlatformEvents();
    this._bindSettings();
    if (query.has('test')) this._exposeTestHook();
    onProgress(1);
    bus.emit(EV.BOOT_READY, { backend: this.renderer.backend });
  }

  /** Starts gameplay (called from the title's start gesture). */
  start() {
    if (this.started) return;
    this.started = true;
    this.loop.start(this.renderer.animationLoopDriver);
    // The key that started the game must not also jump: gameplay input opens after this gesture's events. (The
    // starting click is handled in Input: a mouse button pressed while gameplay was closed is ignored until up.)
    setTimeout(() => {
      this.input.gameplayEnabled = !this.portraitBlocked;
    }, 0);
    this.canvas.focus({ preventScroll: true });
    this.bus.emit(EV.GAME_START, {});
    if (this.story && this._storyStart) {
      const { id, step, checkpoint } = this._storyStart;
      if (checkpoint?.position) this.placePlayer(checkpoint.position, checkpoint.yaw);
      if (id) this.story.start(id, step);
    }
    this.telemetry.track('session_start', {
      backend: this.renderer.backend,
      preset: this.quality.presetName,
      device: this.platform.isTouch ? 'touch' : 'desktop',
      lang: this.i18n.language,
    });
  }

  /**
   * @param {number} dt
   */
  _frameStart(dt) {
    this._frameStartMs = performance.now();
    this.input.update(dt);
  }

  /**
   * One fixed simulation tick.
   * @param {number} dt
   */
  _fixed(dt) {
    this.input.beginTick(this.time.tick);
    if (this._regionLoading) {
      // The old region is gone and the new one is not built: hold everything still behind the fade.
      this.bus.flush();
      return;
    }
    const cutscene = this.story?.blocking ?? false;
    if (cutscene) for (const action of CUTSCENE_SWALLOW) this.input.consume(action);
    const intent = cutscene ? STILL : (this._testIntent ?? this.controller.update(this.cameraSystem.yaw));
    if (this.world?.deadlyWater) this.traversal.hazardWaterLevel = this.world.waterLevel;
    this._updateAssists();
    if (!cutscene) this.combat.fixedUpdate(dt, intent);
    this.traversal.fixedUpdate(dt, intent);
    this.physics.step(dt);
    this.director.fixedUpdate(dt, this._playerAdapter);
    this.encounters.fixedUpdate(dt, this._currentFeet());
    this.story?.fixedUpdate(dt);
    this._probeGround();
    this.bus.flush();
  }

  /**
   * Where the story starts: `?mission=<id>[&step=<id>]`, or the save (its checkpoint when it belongs to the saved
   * mission). Returns the mission (null once the slice's last mission is done: free roam), step, region and ability
   * set, or null when the save names no known mission.
   * @param {URLSearchParams} query
   * @returns {{ id: string|null, step: string|null, region: string, abilities: string|null,
   *   checkpoint: object|null }|null}
   */
  _storyStartPoint(query) {
    const missions = this.storyContent.missions;
    const story = this.saveDoc.story;
    const requested = query.get('mission');
    let id = requested ?? story.mission;
    let mission = missions[id];
    if (!mission) {
      if (requested) log.add('warn', `Unknown mission "${requested}"`);
      return null;
    }
    // Saved after a mission ended but before the next one began (closed during the region change): go on.
    let finished = !requested && this.saveDoc.missions.completed[id] === true;
    const next = mission.end?.find((action) => action.next)?.next;
    if (finished && missions[next]) {
      id = next;
      mission = missions[next];
      finished = false;
    }
    const saved = this.saveDoc.checkpoint;
    const checkpoint = !requested && saved?.mission === id ? saved : null;
    // finished: the slice's last mission is done; free roam where it ended.
    return {
      id: finished ? null : id,
      step: requested ? query.get('step') : (checkpoint?.step ?? null),
      region: checkpoint?.region ?? mission.region,
      abilities: mission.abilities ?? null,
      checkpoint,
    };
  }

  /**
   * Places Bayu (mission teleports, checkpoints): feet position, optional facing; the camera snaps behind.
   * @param {{ x: number, y: number, z: number }|number[]} point
   * @param {number} [yaw] radians
   */
  placePlayer(point, yaw) {
    const [x, y, z] = Array.isArray(point) ? point : [point.x, point.y, point.z];
    this.combat.reset();
    this.traversal.respawnAt({ x, y, z });
    if (Number.isFinite(yaw)) this.traversal.facing = this.traversal.prevFacing = yaw;
    this.cameraSystem.snapBehind(this.traversal.facing);
  }

  /**
   * Saves progress here (mission checkpoints and every mission's end, TECHNICAL §9).
   * @param {{ mission: string|null, step: string|null }} at
   * @returns {boolean} whether the save was written
   */
  checkpoint({ mission, step }) {
    const feet = this._currentFeet();
    this.saveDoc.checkpoint = {
      region: this.sceneId,
      mission,
      step,
      position: [round2(feet.x), round2(feet.y), round2(feet.z)],
      yaw: round2(this.traversal.facing),
    };
    return this.saves.save(this.saveDoc);
  }

  /**
   * Moves play to another region behind the fade (end of the prologue): drops the old region's world, enemies and
   * encounters, builds the new one, loads its enemy models, and places Bayu at a marker.
   * @param {string} id region
   * @param {string} [markerName='spawn']
   * @param {string|null} [abilitySet] ability set for the new region (default: the region's)
   */
  async changeRegion(id, markerName = 'spawn', abilitySet = null) {
    const wasDark = this.fade.dark;
    this.bus.emit(EV.REGION_CHANGE, { id, marker: markerName });
    if (!wasDark) await new Promise((resolve) => setTimeout(resolve, REGION_FADE_MS));
    const manifest = data('generated/assets').assets;
    // Kits both regions share stay loaded across the swap (one extra reference until the new world holds its own).
    const kits = (await loadData(`regions/${id}`)).kits.map((key) => manifest[key]);
    await this.assets.loadAll(kits);
    this._regionLoading = true;
    this.combat.reset();
    this.director.stop();
    this.enemyViews.clear();
    this.encounters.dispose();
    this.world.dispose();
    for (const url of this._enemyAssetUrls) this.assets.release(url);
    this.sceneId = id;
    const enemyKeys = enemyModelKeys(data('encounters'), id);
    const enemyEntries = [...enemyKeys].map((key) => manifest[key]);
    this._enemyAssetUrls = enemyEntries.map((entry) => entry.url);
    this.world = this._newWorld();
    const [enemyAssets] = await Promise.all([this.assets.loadAll(enemyEntries), this.world.load(id)]);
    for (const entry of kits) this.assets.release(entry.url);
    this.enemyViews.models = this._enemyModels(enemyKeys, (key) => enemyAssets.get(manifest[key].url));
    this.encounters = this._createEncounters();
    this.abilities.useSet(abilitySet ?? this.abilities.setForRegion(id));
    const marker = this.world.markers[markerName];
    this.placePlayer(marker.p, marker.yaw);
    await this.renderer.three.compileAsync(this.scene, this.camera);
    this._regionLoading = false;
    this.bus.emit(EV.REGION_READY, { id });
  }

  _newWorld() {
    return new World({
      scene: this.scene,
      physics: this.physics,
      assets: this.assets,
      renderer: this.renderer,
      bus: this.bus,
      preset: this.quality.preset,
    });
  }

  _createEncounters() {
    return new Encounters({
      bus: this.bus,
      director: this.director,
      combat: this.combat,
      traversal: this.traversal,
      defs: data('encounters'),
      regionId: this.sceneId,
      world: this.world,
      // With a story running, missions start the fights; free roam (`?scene=`) keeps the layout triggers.
      autoStart: !this.storyContent,
    });
  }

  /**
   * Enemy models by name for EnemyViews.
   * @param {Set<string>} keys manifest keys loaded for this region
   * @param {(key: string) => { scene: import('three').Object3D }} byKey
   */
  _enemyModels(keys, byKey) {
    const models = {};
    for (const name of ['wisp', 'villager_man', 'adi']) {
      const key = `characters/${name}`;
      models[name] = keys.has(key) ? byKey(key) : null;
    }
    return models;
  }

  /** Current (tick) feet position, shared object. */
  _currentFeet() {
    const cc = this.character;
    this._tickFeet.x = cc.position.x;
    this._tickFeet.y = cc.feetY;
    this._tickFeet.z = cc.position.z;
    return this._tickFeet;
  }

  /**
   * Plays Bayu's silat on the action layer: strikes, steps, guards, hits, the finisher.
   * @param {{ action: string, clip: string, seconds: number }} action
   */
  _playCombatAction({ action, clip, seconds }) {
    const animator = this.avatar.animator;
    const source = this.clips.get(clip);
    if (!source) return;
    if (action === 'guard') {
      animator.playAction(clip, { loop: true, fadeIn: 0.05 });
      this._guardAnim = true;
      return;
    }
    // Swings and steps are short on purpose: compress the library clip into the move's duration.
    animator.playAction(clip, {
      duration: seconds,
      timeScale: Math.max(1, source.duration / seconds),
      fadeIn: action === 'hit' ? 0.03 : 0.05,
      fadeOut: 0.12,
    });
  }

  /**
   * Puts Tok Wan's tongkat in Bayu's right hand.
   * @param {{ scene: import('three').Object3D }} props
   */
  _attachTongkat(props) {
    const config = data('animation/human').tongkat;
    const source = props.scene.children.find((node) => node.userData.hk_prop === 'tongkat');
    if (!source || !config) return;
    const tongkat = source.clone(true);
    tongkat.name = 'Tongkat';
    tongkat.position.fromArray(config.position);
    const [rx, ry, rz] = config.rotationDeg.map((deg) => (deg * Math.PI) / 180);
    tongkat.rotation.set(rx, ry, rz);
    tongkat.traverse((object) => {
      if (object.isMesh) object.frustumCulled = false;
    });
    this.avatar.attach(tongkat, config.bone);
    this.tongkat = tongkat;
  }

  /** Movement assists from settings: ledge magnet radius ('auto' follows the device) and auto-mantle. */
  _updateAssists() {
    const setting = this.settings.get('assists.ledgeMagnet');
    const radii = data('tuning/player').magnet;
    let radius = radii.keyboard;
    if (setting === 'auto') radius = radii[this.input.device] ?? radii.keyboard;
    else if (setting === false || setting === 'off') radius = 0;
    else if (typeof setting === 'number') radius = setting;
    this.traversal.assist.magnetRadius = radius;
    this.traversal.assist.autoMantle = this.settings.get('assists.autoMantle') !== false;
  }

  /**
   * Keeps the animator's base state in line with the traversal state, and leans the body away from the wall on a
   * wall-run (feet on the wall). Mantles and climbs play on the action layer (PLAYER_MANTLE).
   * @param {number} dt
   */
  _syncAnimator(dt) {
    const animator = this.avatar.animator;
    const state = this.traversal.state;
    const free = ['ground', 'land', 'hardLand', 'air', 'jumpStart'];
    animator.setSpeed(this.traversal.speed);
    switch (state) {
      case 'air':
        if (animator.state !== 'air' && animator.state !== 'jumpStart') animator.setState('air');
        break;
      case 'ground':
      case 'step':
        if (!free.includes(animator.state) || animator.state === 'air') animator.setState('ground');
        break;
      case 'wallRun':
      case 'slide':
      case 'glide':
      case 'hang':
        animator.setState(state);
        break;
      default:
        break;
    }
    const leanDeg = data('tuning/player').wallRun.leanDeg;
    const targetLean = -this.traversal.wallSide * leanDeg * (Math.PI / 180);
    this._lean += (targetLean - this._lean) * Math.min(1, dt * 10);
    this.avatar.root.rotation.z = this._lean;
    // Gliding: lean into the flight, pivoting about the hands on the wau so the kite stays put.
    const glide = data('animation/human').glide;
    const targetPitch = state === 'glide' ? (glide.pitchDeg * Math.PI) / 180 : 0;
    this._pitch += (targetPitch - this._pitch) * Math.min(1, dt * glide.blend);
    const root = this.avatar.root;
    root.rotation.x = this._pitch;
    if (Math.abs(this._pitch) > 1e-4) {
      const h = glide.pivotHeight;
      const s = Math.sin(this._pitch);
      root.position.x -= Math.sin(root.rotation.y) * h * s;
      root.position.y += h * (1 - Math.cos(this._pitch));
      root.position.z -= Math.cos(root.rotation.y) * h * s;
    }
    this.wau.update(dt);
  }

  /** Height of the ground under the player (for the blob shadow); one short ray per tick while airborne. */
  _probeGround() {
    const cc = this.character;
    if (cc.grounded) {
      this.groundY = cc.feetY;
      return;
    }
    this._probe.x = cc.position.x;
    this._probe.y = cc.feetY + 0.1;
    this._probe.z = cc.position.z;
    const hit = this.physics.castRay(this._probe, this._down, 8);
    this.groundY = hit.hit ? hit.point.y : NaN;
  }

  /**
   * One rendered frame.
   * @param {number} dt
   */
  _frame(dt) {
    if (this._resizeQueued) this._resize();
    const alpha = this.time.alpha;
    // Animation follows game time: frozen in hit-stop, slowed after a perfect langkah.
    const animDt = this.time.hitStopRemaining > 0 ? 0 : dt * this.time.scale;
    this.combat.frameUpdate(dt);
    this.character.interpolatedFeet(alpha, this._feet);
    const facing = this.traversal.interpolatedFacing(alpha);
    this.avatar.root.position.copy(this._feet);
    this.avatar.root.rotation.y = facing;
    this._syncAnimator(animDt);
    if (this._guardAnim && this.combat.state !== 'guard') {
      this.avatar.animator.stopAction(0.12);
      this._guardAnim = false;
    }
    this.physics.interpolate(alpha);
    if (this.combat.trauma > 0) {
      this.cameraSystem.addTrauma(this.combat.trauma);
      this.combat.trauma = 0;
    }
    // Story first: a cutscene sets this frame's camera shot.
    this.story?.frameUpdate(dt, this.time.realTime, this._feet, facing);
    // Hard lock-on: the camera settles behind Bayu, looking at the target.
    const target = this.combat.hardLock ? this.combat.target : null;
    const lookYaw = target
      ? Math.atan2(target.position.x - this._feet.x, target.position.z - this._feet.z)
      : facing;
    const cameraMode = target ? 'lockOn' : this.traversal.state;
    this.cameraSystem.update(
      dt,
      this._feet,
      lookYaw,
      Math.max(this.traversal.speed, target ? 1 : 0),
      cameraMode,
    );
    this.avatar.update(animDt, this.camera, this.groundY);
    this.enemyViews.update(animDt, alpha, this.camera, this.time.realTime);
    this.motes.update(this.time.realTime);
    this.hud.update(dt, this.camera, this.combat.inCombat, this.combat.hardLock);
    if (!this._regionLoading) {
      this.world?.update(dt, this.camera, this._feet);
      this.renderer.render(this.scene, this.camera);
    }
    this.overlay.update(dt);
    this.perf.record(dt);
    this.quality.update(dt, (performance.now() - this._frameStartMs) / 1000);

    this._fpsTimer += dt;
    if (this._fpsTimer >= TELEMETRY_FPS_INTERVAL) {
      this._fpsTimer = 0;
      const window60 = this.perf.takeWindow();
      const p95 = this.perf.percentileFrameTime(600, 0.95);
      this.telemetry.track('fps_summary', {
        fpsAvg: Math.round(window60.fpsAvg * 10) / 10,
        fpsP5: p95 > 0 ? Math.round((1 / p95) * 10) / 10 : 0,
        backend: this.renderer.backend,
        preset: this.quality.presetName,
      });
    }
  }

  _resize() {
    this._resizeQueued = false;
    const width = window.innerWidth;
    const height = window.innerHeight;
    this.renderer.resize(width, height);
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
  }

  _createUi() {
    this.overlay = new DebugOverlay({
      root: this.uiRoot,
      bus: this.bus,
      log,
      forceWebGL: this.renderer.backend === 'webgl2' && this.platform.hasWebGPU,
      onToggleWebGL: (force) => {
        this.settings.set('graphics.forceWebGL', force);
        this.settings.persist();
        const url = new URL(location.href);
        if (force) url.searchParams.set('webgl', '1');
        else url.searchParams.delete('webgl');
        location.replace(url);
      },
      collect: () => this._stats(),
    });
    if (this.platform.query.get('debug') === '1') this.overlay.setVisible(true);
    this.hud = new CombatHud({ root: this.uiRoot, bus: this.bus, i18n: this.i18n, director: this.director });
    this.touch = new TouchControls({
      root: this.touchRoot,
      input: this.input,
      bus: this.bus,
      i18n: this.i18n,
      settings: this.settings,
      layout: data('ui/touchLayout'),
      startVisible: this.platform.isTouch,
    });
    if (this.sceneId === 'sandbox') {
      const hint = document.createElement('p');
      hint.className = 'hk-sandbox-hint';
      hint.dataset.i18n = 'sandbox.hint';
      hint.textContent = this.i18n.t('sandbox.hint');
      this.uiRoot.appendChild(hint);
    }
  }

  _stats() {
    const info = this.renderer.three.info;
    const avg = this.perf.averageFrameTime(60);
    const max = this.perf.maxFrameTime(60);
    const memory = /** @type {any} */ (performance).memory;
    return {
      FPS: avg > 0 ? (1 / avg).toFixed(1) : '-',
      'Frame ms': `${(avg * 1000).toFixed(2)} avg / ${(max * 1000).toFixed(1)} max`,
      'Draw calls': info.render.drawCalls,
      Triangles: info.render.triangles,
      'Geo / Tex': `${info.memory.geometries} / ${info.memory.textures}`,
      'GPU mem est': `${(info.memory.total / 1048576).toFixed(1)} MB`,
      Physics: `${this.physics.bodyCount} bodies / ${this.physics.colliderCount} colliders`,
      'JS heap': memory ? `${(memory.usedJSHeapSize / 1048576).toFixed(1)} MB` : 'n/a',
      Backend: this.renderer.backend,
      Preset: `${this.quality.presetName}${this.quality.fpsCap ? ` @${this.quality.fpsCap}` : ''}`,
      'Render scale': `${this.renderer.renderScale.toFixed(2)} (${this.renderer.pixelRatio.toFixed(2)}x)`,
      'Ticks/frame': `${this.loop.lastSteps} (dropped ${this.loop.droppedFrames})`,
      Player: `${this.traversal.state} ${this.traversal.speed.toFixed(2)} m/s${this.traversal.sprinting ? ' sprint' : ''}`,
      Input: this.input.device,
      Audio: this.audio.state,
    };
  }

  _bindPlatformEvents() {
    const queueResize = () => {
      this._resizeQueued = true;
      if (!this.loop.running) this._resize();
    };
    window.addEventListener('resize', queueResize);
    window.visualViewport?.addEventListener('resize', queueResize);
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) {
        this.loop.stop();
        this.audio.suspend();
        this.settings.persist();
        this.bus.emit(EV.APP_HIDDEN, {});
      } else if (this.started) {
        this.loop.resetClock();
        this.loop.start(this.renderer.animationLoopDriver);
        this.audio.resume();
        this.bus.emit(EV.APP_VISIBLE, {});
      }
    });
    window.addEventListener('pagehide', () => {
      this.settings.persist();
      this.telemetry.track('quit', { seconds: Math.round(this.time.realTime) });
      this.telemetry.flush(true);
    });
    const orientation = () => {
      const blocked = this.platform.isTouch && isPortrait();
      if (blocked === this.portraitBlocked) return;
      this.portraitBlocked = blocked;
      if (blocked) this.input.releaseAll();
      this.input.gameplayEnabled = !blocked && this.started;
      this.bus.emit(EV.ORIENTATION_CHANGED, { portrait: blocked });
    };
    window.matchMedia('(orientation: portrait)').addEventListener('change', orientation);
    orientation();
    this.canvas.addEventListener('click', () => {
      if (this.started && this.input.device === 'keyboard') this.input.requestPointerLock();
    });
  }

  _bindSettings() {
    this.bus.on(EV.SETTINGS_CHANGED, ({ path }) => {
      if (path === '*' || path.startsWith('graphics.')) {
        this.quality.apply();
        this.loop.setFpsCap(this.quality.fpsCap);
        this.postfx.build(this.scene, this.camera, this.quality.preset);
      }
      if (path === '*' || path.startsWith('audio.')) this.audio.applyVolumes();
      if (path === '*' || path === 'telemetry') this.telemetry.setEnabled(this.settings.get('telemetry'));
      if (path === '*' || path === 'bindings') this.input.setBindings(this.settings.get('bindings'));
    });
    this.bus.on(EV.LANGUAGE_CHANGED, () => this.i18n.applyTo(document));
  }

  _exposeTestHook() {
    const engine = this;
    Object.defineProperty(window, '__hk', {
      configurable: true,
      value: Object.freeze({
        get ready() {
          return true;
        },
        get started() {
          return engine.started;
        },
        get backend() {
          return engine.renderer.backend;
        },
        get frame() {
          return engine.time.frame;
        },
        stats: () => engine._stats(),
        /** The engine itself, for diagnostics in tests (test hook only). */
        get engine() {
          return engine;
        },
        player: () => ({
          x: engine.character.position.x,
          y: engine.character.feetY,
          z: engine.character.position.z,
          state: engine.traversal.state,
          speed: engine.traversal.speed,
          vy: engine.traversal.velocity.y,
        }),
        errors: () => log.entries.filter((e) => e.level !== 'info').map((e) => `${e.level}: ${e.message}`),
        /**
         * Fixed camera shot for screenshots: view([px, py, pz], [tx, ty, tz]); view(null) returns to the follow camera.
         * @param {number[]|null} position
         * @param {number[]} [target]
         */
        view: (position, target) => {
          engine.cameraSystem.override = position
            ? { position: new Vector3(...position), target: new Vector3(...target) }
            : null;
        },
        /**
         * Teleports the player (feet position) for tests.
         * @param {number[]} feet
         */
        teleport: (feet) => engine.traversal.respawnAt({ x: feet[0], y: feet[1], z: feet[2] }),
        /**
         * Drives the player with a world-space intent instead of the camera-relative controls (bots, tests);
         * null hands control back.
         * @param {{ x: number, z: number, magnitude: number, sprintHeld?: boolean }|null} intent
         */
        drive: (intent) => {
          engine._testIntent = intent ? { sprintHeld: false, ...intent } : null;
        },
        /**
         * Holds or releases a game action as a virtual button.
         * @param {string} action
         * @param {boolean} down
         */
        button: (action, down) => engine.input.setVirtualButton(action, down),
        /**
         * Starts one of this region's encounters (data/encounters.json).
         * @param {string} id
         */
        encounter: (id) => engine.encounters.start(id),
        /** Bayu's combat state. */
        combat: () => ({
          state: engine.combat.state,
          move: engine.combat.moveName,
          health: engine.combat.health,
          semangat: engine.combat.semangat,
          target: engine.combat.target?.id ?? null,
          hardLock: engine.combat.hardLock,
          inCombat: engine.combat.inCombat,
          timeScale: engine.time.scale,
        }),
        /** Where the story stands (null in free roam). */
        story: () => {
          const story = engine.story;
          if (!story) return null;
          const doc = engine.saveDoc;
          return {
            region: engine.sceneId,
            mission: story.missions.mission?.id ?? null,
            step: story.missions.step?.id ?? null,
            cutscene: story.cutscenes.active?.def.id ?? null,
            dialogue: story.dialogue.current?.id ?? null,
            loading: !!engine._regionLoading,
            flags: { ...doc.story.flags },
            journal: [...doc.story.journal],
            pages: [...doc.story.pages],
            cahaya: doc.progression.cahaya,
            completed: Object.keys(doc.missions.completed),
            checkpoint: doc.checkpoint,
            kelip: story.kelip?.visible ?? false,
          };
        },
        /** Starts a mission (at a step) as if the story had reached it. */
        mission: (id, step = null) => engine.story.start(id, step),
        /** The saved document as written to storage. */
        savedDoc: () => engine.saves.load().doc,
        /** The current encounter's enemies. */
        enemies: () =>
          engine.director.enemies.map((e) => ({
            id: e.id,
            archetype: e.archetype,
            state: e.state,
            vitality: e.vitality,
            x: e.position.x,
            y: e.position.y,
            z: e.position.z,
          })),
        /**
         * Loads manifest entries with the real AssetLoader (KTX2 + Meshopt on this renderer), summarises what came
         * back, then releases everything. Test hook only (`?test=1`).
         * @param {string[]} keys manifest keys, e.g. `kits/kampung_kit`
         */
        loadAssets: async (keys) => {
          // The engine's loader: a second KTX2Loader on one renderer makes three warn (and wastes workers).
          const loader = engine.assets;
          const manifest = data('generated/assets').assets;
          const entries = keys.map((key) => manifest[key]);
          const loaded = await loader.loadAll(entries);
          const summary = {};
          keys.forEach((key, index) => {
            const gltf = loaded.get(entries[index].url);
            const textures = new Set();
            let meshes = 0;
            let triangles = 0;
            gltf.scene.traverse((object) => {
              if (!object.isMesh) return;
              meshes++;
              const geometry = object.geometry;
              triangles += (geometry.index ? geometry.index.count : geometry.attributes.position.count) / 3;
              for (const material of [object.material].flat()) {
                for (const value of Object.values(material)) if (value?.isTexture) textures.add(value);
              }
            });
            summary[key] = {
              meshes,
              triangles: Math.round(triangles),
              textures: textures.size,
              compressed: [...textures].filter((t) => t.isCompressedTexture).length,
              clips: gltf.animations.length,
            };
          });
          for (const entry of entries) loader.release(entry.url);
          return summary;
        },
      }),
    });
  }
}
