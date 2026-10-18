import './ui/styles/tokens.css';
import './ui/styles/base.css';
import './ui/styles/overlay.css';
import './ui/styles/touch.css';
import './ui/styles/screens.css';
import './ui/styles/menus.css';
import { AudioManager } from './audio/AudioManager.js';
import { data, lazyKeys, loadData } from './core/Data.js';
import { EV } from './core/events.js';
import { EventBus } from './core/EventBus.js';
import { I18n, resolveInitialLanguage } from './core/I18n.js';
import { log } from './core/Log.js';
import { detectPlatform } from './core/Platform.js';
import { Settings } from './core/Settings.js';
import { AUTO_RESOLVERS } from './core/settingsAuto.js';
import { download, warm } from './core/Prefetch.js';
import { createStorage } from './core/storage.js';
import { showErrorScreen } from './ui/ErrorScreen.js';
import { TitleScreen } from './ui/TitleScreen.js';

// Entry chunk: everything the title needs, kept small. The engine (three.js, Rapier) loads behind it.
log.install(window);

const platform = detectPlatform(window);
const bus = new EventBus();
bus.onHandlerError = (error, type) => log.add('error', `Event handler for "${type}" failed`, error);
const storage = createStorage();
const settings = new Settings({
  storage,
  bus,
  defaults: data('settings.defaults'),
  platform,
  autoResolvers: AUTO_RESOLVERS,
});
settings.load();

const i18n = new I18n({
  tables: { bm: data('i18n/bm'), en: data('i18n/en') },
  language: resolveInitialLanguage(settings.get('language'), platform.languages),
  bus,
});
document.documentElement.lang = i18n.language === 'bm' ? 'ms' : 'en';
i18n.applyTo(document);
applyPresentationSettings();
bus.on(EV.SETTINGS_CHANGED, ({ path }) => {
  if (path === '*' || path.startsWith('accessibility.')) applyPresentationSettings();
  if (path === '*' || path === 'language') {
    const language = resolveInitialLanguage(settings.get('language'), platform.languages);
    i18n.setLanguage(language);
  }
});

const audio = new AudioManager({ settings });
const uiRoot = /** @type {HTMLElement} */ (document.getElementById('ui-root'));
const title = new TitleScreen({
  root: /** @type {HTMLElement} */ (document.getElementById('title')),
  i18n,
  platform,
});
title.onGesture = () => audio.unlock();
bus.on(EV.LANGUAGE_CHANGED, () => title.refreshText());
title.show();

/** @type {import('./core/Engine.js').Engine|null} */
let engine = null;
title.onStart = () => engine?.start();

const startEarlyDownloads = earlyDownloads();
// The story's small data files (missions, dialogue, region layouts) are needed first thing in boot: ask now.
for (const prefix of data('boot').dataFiles) {
  for (const key of lazyKeys(prefix)) loadData(key).catch(() => {});
}
boot();

/**
 * The downloads nearly every start needs, started while the engine's scripts parse and start up (pillar 1): as soon
 * as those scripts have arrived (so on a slow link they do not share its bandwidth), or when the engine module
 * resolves, whichever comes first. The list is data/boot.json; the player's model is young Wan for a new save or
 * `?mission=P`, otherwise Bayu. The engine's loader takes the downloads over; a wrong guess only costs bandwidth.
 * @returns {() => void} starts them (once)
 */
function earlyDownloads() {
  let started = false;
  const start = () => {
    if (started) return;
    started = true;
    observer?.disconnect();
    startDownloads();
  };
  const scripts = new RegExp(data('boot').scripts);
  const arrived = new Set();
  const observer =
    typeof PerformanceObserver === 'function'
      ? new PerformanceObserver((list) => {
          for (const entry of list.getEntries()) {
            const match = entry.name.match(scripts);
            if (match) arrived.add(match[1]);
          }
          if (arrived.size >= data('boot').scriptCount) start();
        })
      : null;
  try {
    observer?.observe({ type: 'resource', buffered: true });
  } catch {
    // no resource timing: the engine module's arrival starts them
  }
  return start;
}

/** Starts the early downloads (see earlyDownloads). */
function startDownloads() {
  const plan = data('boot');
  const manifest = data('generated/assets').assets;
  const query = platform.query;
  const mission = query.get('mission');
  const fresh = !mission && !query.has('scene') && !storage.get(plan.saveKey);
  const avatar = mission === plan.prologueMission || fresh ? plan.prologueAvatar : plan.avatar;
  const fetchImpl = globalThis.fetch.bind(globalThis);
  for (const key of [...plan.assets, `characters/${avatar}`]) {
    if (manifest[key]) download(manifest[key].url, fetchImpl);
  }
  for (const file of plan.transcoder) warm(`/vendor/three-${__THREE_VERSION__}/basis/${file}`);
}

async function boot() {
  try {
    const { Engine } = await import('./core/Engine.js');
    startEarlyDownloads();
    engine = new Engine({
      canvas: /** @type {HTMLCanvasElement} */ (document.getElementById('game-canvas')),
      uiRoot,
      touchRoot: /** @type {HTMLElement} */ (document.getElementById('touch-root')),
      bus,
      settings,
      i18n,
      platform,
      storage,
      audio,
    });
    await engine.boot((fraction) => title.setProgress(fraction));
    title.setReady();
  } catch (error) {
    log.add('error', 'Boot failed', error);
    const noGpu = !platform.hasWebGPU && !webgl2Available();
    title.dispose();
    showErrorScreen({
      root: uiRoot,
      i18n,
      titleKey: noGpu ? 'error.noGpu.title' : 'error.boot.title',
      bodyKey: noGpu ? 'error.noGpu.body' : 'error.boot.body',
      detail: error instanceof Error ? error.message : String(error),
    });
  }
}

/** Applies reduced motion, high contrast and UI scale to the document. */
function applyPresentationSettings() {
  const root = document.documentElement;
  root.classList.toggle('hk-touch-device', platform.isTouch);
  root.classList.toggle('hk-reduced-motion', settings.resolve('accessibility.reducedMotion') === true);
  root.classList.toggle('hk-high-contrast', settings.get('accessibility.highContrastUI') === true);
  root.style.setProperty('--ui-scale', String(settings.get('accessibility.uiScale')));
}

/**
 * Whether a WebGL 2 context can be created at all (only used to word the error message).
 * @returns {boolean}
 */
function webgl2Available() {
  try {
    const gl = document.createElement('canvas').getContext('webgl2');
    gl?.getExtension('WEBGL_lose_context')?.loseContext();
    return !!gl;
  } catch {
    return false;
  }
}
