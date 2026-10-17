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
  /** { kind: 'move'|'select'|'back'|'step' } — a menu responded (focus moved, a button pressed, back, a value changed) */
  UI_FEEDBACK: 'ui:feedback',

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
  /** { reason: 'water'|'fell'|'defeated' } — the screen fades; a respawn or encounter restart follows (under 2 s) */
  PLAYER_FELL: 'player:fell',
  /** { reason: string } */
  PLAYER_RESPAWNED: 'player:respawned',
  /** { kind: 'step'|'mantle'|'climb', height: number, duration: number } — a scripted climb started */
  PLAYER_MANTLE: 'player:mantle',
  /** { grabbed: boolean } — caught a ledge (true) or let go of it (false) */
  PLAYER_LEDGE: 'player:ledge',
  /** { started: boolean, side: -1|1 } — wall-run began or ended (side: wall on the left −1 or right +1) */
  PLAYER_WALLRUN: 'player:wallrun',
  /** { started: boolean } */
  PLAYER_SLIDE: 'player:slide',
  /** { open: boolean } — the wau opened or closed */
  PLAYER_GLIDE: 'player:glide',

  /** { damage: number, health: number } — an enemy strike connected */
  PLAYER_HIT: 'player:hit',
  /** { perfect: boolean } — tangkis met a strike (perfect = attacker staggered) */
  PLAYER_PARRY: 'player:parry',
  /** { perfect: boolean } — langkah avoided a strike (perfect = slow motion and an opening) */
  PLAYER_DODGE: 'player:dodge',
  /** { move: string } — a strike, heavy, counter or finisher started */
  PLAYER_ATTACK: 'player:attack',
  /** { action: 'attack'|'finisher'|'dodge'|'guard'|'hit', move: string, clip: string, seconds: number } (animation) */
  COMBAT_ACTION: 'combat:action',
  /** { health: number, max: number } */
  PLAYER_HEALTH: 'player:health',
  /** {} — health reached zero; the encounter restarts */
  PLAYER_DEFEATED: 'player:defeated',
  /** { value: number, max: number } */
  SEMANGAT_CHANGED: 'combat:semangat',
  /** { id: number|null } — lock-on target changed */
  LOCK_CHANGED: 'combat:lock',

  /** { id: number, archetype: string } */
  ENEMY_SPAWNED: 'enemy:spawned',
  /** { id: number, kind: 'strike'|'dash', seconds: number } — wind-up began (read the tell) */
  ENEMY_TELEGRAPH: 'enemy:telegraph',
  /** { id: number, damage: number, vitality: number, max: number } */
  ENEMY_HIT: 'enemy:hit',
  /** { id: number, reason: 'parry'|'poise' } */
  ENEMY_STAGGERED: 'enemy:staggered',
  /** { id: number, phase: number } — a boss entered its next phase */
  ENEMY_PHASE: 'enemy:phase',
  /** { id: number, archetype: string, kind: 'wisp'|'cursed'|'boss' } — dissolved (wisp) or freed (cursed) */
  ENEMY_DEFEATED: 'enemy:defeated',
  /** { id: number } — gone from the scene */
  ENEMY_REMOVED: 'enemy:removed',
  /** { id: string } */
  ENCOUNTER_STARTED: 'encounter:started',
  /** { id: string } */
  ENCOUNTER_CLEARED: 'encounter:cleared',

  /** { id: string } */
  MISSION_STARTED: 'mission:started',
  /** { mission: string, step: string, objective: string|null } — a mission step began */
  MISSION_STEP: 'mission:step',
  /** { id: string } */
  MISSION_COMPLETED: 'mission:completed',
  /** { mission: string, step: string } — progress saved here */
  CHECKPOINT: 'mission:checkpoint',
  /** { name: string, value: any } */
  STORY_FLAG: 'story:flag',
  /** { id: string } — a journal line was added */
  JOURNAL_ADDED: 'story:journal',
  /** { value: number } */
  CAHAYA_CHANGED: 'story:cahaya',
  /** { page: number } — a hikayat page returned */
  PAGE_RETURNED: 'story:page',
  /** { id: string, speaker: string, text: string, seconds: number } — show this subtitle now */
  DIALOGUE_LINE: 'dialogue:line',
  /** {} — the current subtitle ended */
  DIALOGUE_CLEAR: 'dialogue:clear',
  /** { id: string } */
  CUTSCENE_STARTED: 'cutscene:started',
  /** { id: string, skipped: boolean } */
  CUTSCENE_ENDED: 'cutscene:ended',
  /** { progress: number } — hold-to-skip progress 0..1 (0 hides the indicator) */
  CUTSCENE_SKIP_PROGRESS: 'cutscene:skip',
  /** { action: string, text: string }|{ action: null } — an on-screen prompt (first-time hints) */
  PROMPT: 'ui:prompt',
  /** { target: { x: number, y: number, z: number }|null } — Kelip's call sent a wave toward the goal */
  KELIP_CALLED: 'guide:kelip',
  /** { id: string, marker: string } — the world is changing region (fade, load, place) */
  REGION_CHANGE: 'world:region',
  /** { id: string } — the new region is ready */
  REGION_READY: 'world:ready',
  /** { dark: boolean } — the story cuts to (or back from) black */
  SCREEN_FADE: 'ui:fade',
  /** { kicker: string, title: string } — i18n keys of a chapter title card */
  TITLE_CARD: 'ui:titleCard',
  /** { id: string } — a race clock started */
  RACE_STARTED: 'race:started',
  /** { id, seconds, won, best, record, cancelled? } — a race ended */
  RACE_FINISHED: 'race:finished',
  /** { id: string, best: number|null } — a time trial began (countdown) */
  TRIAL_STARTED: 'trial:started',
  /** { n: number } — countdown 3, 2, 1 */
  TRIAL_COUNTDOWN: 'trial:countdown',
  /** { id: string } — go */
  TRIAL_GO: 'trial:go',
  /** { id, seconds, medal: 'gold'|'silver'|'bronze'|null, best, record, newMedal, medals } */
  TRIAL_FINISHED: 'trial:finished',
  /** { id: string } — the trial was left */
  TRIAL_EXITED: 'trial:exited',
  /** { id: string } — an achievement was earned */
  ACHIEVEMENT: 'progress:achievement',
  /** { title: string, body?: string, kind?: string } — i18n keys of a short notice */
  TOAST: 'ui:toast',

  /** { delay: number } — a lightning flash; thunder should follow after `delay` seconds */
  LIGHTNING: 'world:lightning',

  /** { id: string, at?: {x,y,z}, gain?: dB, rate?: number, delay?: s, priority?: number, ref?: m } — play a sound */
  SOUND: 'audio:sound',
  /** { state: string|null, scene: boolean } — music state for the mission (scene false) or the cutscene (true) */
  MUSIC: 'audio:music',
  /** { id: string } — a music stinger on the next beat */
  MUSIC_STING: 'audio:sting',

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
