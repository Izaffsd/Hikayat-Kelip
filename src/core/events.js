/**
 * Event names used on the EventBus. Payload shapes are documented next to each name.
 * Systems communicate only through these events and the services the Engine injects.
 * @readonly
 * @enum {string}
 */
export const EV = Object.freeze({
  /** { loaded: number, total: number, label: string } — boot progress in bytes or steps */
  BOOT_PROGRESS: 'boot:progress',
  /** { backend: 'webgpu'|'webgl2' } — engine booted, content loaded and compiled */
  BOOT_READY: 'boot:ready',
  /** {} — the player started the game from the title */
  GAME_START: 'game:start',
  /** { paused: boolean, reason: string } */
  PAUSE_CHANGED: 'game:pause',
  /** {} — the page was hidden (tab switch, app switch, screen lock) */
  APP_HIDDEN: 'app:hidden',
  /** {} — the page became visible again */
  APP_VISIBLE: 'app:visible',
  /** { portrait: boolean } — orientation changed on a touch device */
  ORIENTATION_CHANGED: 'app:orientation',

  /** { device: 'keyboard'|'gamepad'|'touch' } — the last-used input device changed */
  INPUT_DEVICE_CHANGED: 'input:device',
  /** { action: string } — a UI navigation action fired (menus) */
  UI_ACTION: 'input:ui',

  /** { path: string, value: unknown } */
  SETTINGS_CHANGED: 'settings:changed',
  /** { language: 'bm'|'en' } */
  LANGUAGE_CHANGED: 'i18n:language',

  /** { width: number, height: number, pixelRatio: number } */
  RESIZE: 'render:resize',
  /** { preset: string, renderScale: number } */
  QUALITY_CHANGED: 'render:quality',

  /** { speed: number } — vertical speed at impact (m/s, positive) */
  PLAYER_LANDED: 'player:landed',
  /** { coyote: boolean, buffered: boolean } */
  PLAYER_JUMPED: 'player:jumped',
  /** { reason: string } */
  PLAYER_RESPAWNED: 'player:respawned',

  /** { schema: number } */
  SAVE_WRITTEN: 'save:written',
  /** { error: string } */
  SAVE_FAILED: 'save:failed',

  /** { type: string, data: object } — anonymous telemetry event */
  TELEMETRY: 'telemetry:event',

  /** { level: 'error'|'warn'|'info', message: string } */
  LOG_ENTRY: 'log:entry',
  /** { visible: boolean } */
  DEBUG_TOGGLED: 'debug:toggled',
});
