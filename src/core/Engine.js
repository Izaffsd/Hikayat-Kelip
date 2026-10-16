import { PerspectiveCamera, Scene, Vector3 } from 'three/webgpu';
import { CameraSystem } from '../camera/CameraSystem.js';
import { CharacterController } from '../physics/CharacterController.js';
import { PhysicsWorld } from '../physics/PhysicsWorld.js';
import { PlayerController } from '../player/Controller.js';
import { Traversal } from '../player/Traversal.js';
import { PostFX } from '../render/PostFX.js';
import { QualityManager } from '../render/QualityManager.js';
import { Renderer } from '../render/Renderer.js';
import { DebugOverlay } from '../ui/DebugOverlay.js';
import { TouchControls } from '../ui/touch/TouchControls.js';
import { SandboxLevel } from '../world/SandboxLevel.js';
import { data } from './Data.js';
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
    onProgress(0.35);
    this.physics = await PhysicsWorld.create();
    onProgress(0.55);

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

    const level = new SandboxLevel({ scene: this.scene, physics: this.physics });
    const { spawn, facing } = level.build();
    this.level = level;
    this.character = new CharacterController(this.physics, data('tuning/player'), spawn);
    this.traversal = new Traversal({
      character: this.character,
      tuning: data('tuning/player'),
      input: this.input,
      time: this.time,
      bus,
    });
    this.traversal.facing = this.traversal.prevFacing = facing;
    this.controller = new PlayerController(this.input);
    this.avatar = SandboxLevel.createAvatar();
    this.scene.add(this.avatar);
    this.cameraSystem = new CameraSystem({
      camera: this.camera,
      physics: this.physics,
      input: this.input,
      settings,
      tuning: data('tuning/camera'),
    });
    this.cameraSystem.snapBehind(facing);
    this.postfx = new PostFX(this.renderer);
    this.postfx.build(this.scene, this.camera, this.quality.preset);
    onProgress(0.75);

    // Warm up shaders behind the title so the first gameplay frame does not hitch.
    this.character.interpolatedFeet(1, this._feet);
    this.avatar.position.copy(this._feet);
    this.cameraSystem.update(0, this._feet, facing, 0);
    await this.renderer.three.compileAsync(this.scene, this.camera);
    onProgress(0.95);

    this.saves = new SaveManager({ storage: this.storage, bus });
    const loaded = this.saves.load();
    this.saveDoc = loaded.doc;
    if (loaded.status !== 'loaded' && loaded.status !== 'new') log.add('warn', `Save: ${loaded.status}`);
    if (!this.storage.available) log.add('warn', this.i18n.t('save.storageUnavailable'));

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
    this.input.gameplayEnabled = !this.portraitBlocked;
    this.canvas.focus({ preventScroll: true });
    this.bus.emit(EV.GAME_START, {});
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
    const intent = this.controller.update(this.cameraSystem.yaw);
    this.traversal.fixedUpdate(dt, intent);
    this.physics.step(dt);
    this.bus.flush();
  }

  /**
   * One rendered frame.
   * @param {number} dt
   */
  _frame(dt) {
    if (this._resizeQueued) this._resize();
    const alpha = this.time.alpha;
    this.character.interpolatedFeet(alpha, this._feet);
    const facing = this.traversal.interpolatedFacing(alpha);
    this.avatar.position.copy(this._feet);
    this.avatar.rotation.y = facing;
    this.physics.interpolate(alpha);
    this.cameraSystem.update(dt, this._feet, facing, this.traversal.speed);
    this.renderer.render(this.scene, this.camera);
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
    this.touch = new TouchControls({
      root: this.touchRoot,
      input: this.input,
      bus: this.bus,
      i18n: this.i18n,
      settings: this.settings,
      layout: data('ui/touchLayout'),
      startVisible: this.platform.isTouch,
    });
    if (this.platform.query.get('scene') !== 'prologue') {
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
         * Loads manifest entries with the real AssetLoader (KTX2 + Meshopt on this renderer), summarises what came
         * back, then releases everything. Test hook only (`?test=1`).
         * @param {string[]} keys manifest keys, e.g. `kits/kampung_kit`
         */
        loadAssets: async (keys) => {
          const { AssetLoader } = await import('./AssetLoader.js');
          const manifest = data('generated/assets').assets;
          const loader = new AssetLoader({
            renderer: engine.renderer.three,
            basisPath: `/vendor/three-${__THREE_VERSION__}/basis/`,
          });
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
          loader.dispose();
          return summary;
        },
      }),
    });
  }
}
