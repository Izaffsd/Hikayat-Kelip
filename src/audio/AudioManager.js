import { setupAudioSession } from '../core/Platform.js';

/** Mixer buses (TECHNICAL §10). */
export const BUSES = Object.freeze(['music', 'ambience', 'sfx', 'voice', 'ui']);
/** Buses the game world speaks on: the pause menu quiets them; the UI bus keeps its level. */
const WORLD_BUSES = Object.freeze(['ambience', 'sfx', 'voice']);
/** Sounds are decoded at this rate before the AudioContext exists (the banks are authored at it). */
const DECODE_RATE = 44100;
const WORLD_PAUSED = 0.2;
const MUSIC_PAUSED_DB = -9;

/**
 * Decibels to a linear gain.
 * @param {number} db
 */
export const dbToGain = (db) => 10 ** (db / 20);

/**
 * Owns the Web Audio graph: buses → (world | music duck) → master → limiter → output. Created and resumed inside the
 * first user gesture (the title tap), with the iOS audio session set to "playback" so sound plays with the silent
 * switch on. Before that, sounds are decoded on an OfflineAudioContext (no autoplay warning; the buffers play in the
 * live context later). The listener follows the camera; music ducks under voices and big story sounds.
 */
export class AudioManager {
  /**
   * @param {object} options
   * @param {import('../core/Settings.js').Settings} options.settings
   */
  constructor({ settings }) {
    this.settings = settings;
    /** @type {AudioContext|null} */
    this.context = null;
    /** @type {GainNode|null} */
    this.master = null;
    /** @type {Record<string, GainNode>} */
    this.buses = {};
    /** @type {GainNode|null} ambience, sfx and voice (paused: quieter) */
    this.world = null;
    /** @type {GainNode|null} the music bus's ducking and pause stage */
    this.musicDuck = null;
    this.unlocked = false;
    this.paused = false;
    /** Listener position (world), read by positional sounds for distance culling. */
    this.listener = { x: 0, y: 0, z: 0 };
    /** @type {OfflineAudioContext|null} */
    this._decoder = null;
    /** @type {Array<() => void>} */
    this._onUnlock = [];
    this._duckDb = 0;
    this._duckTime = 0;
    this._musicLevel = 1;
  }

  /**
   * Creates/resumes the AudioContext. Must be called synchronously inside a user gesture handler.
   * @returns {boolean} true when audio is (or will become) running
   */
  unlock() {
    if (this.unlocked) return true;
    setupAudioSession();
    const Ctor = globalThis.AudioContext || /** @type {any} */ (globalThis).webkitAudioContext;
    if (!Ctor) return false;
    if (!this.context) this._build(new Ctor({ latencyHint: 'interactive' }));
    // resume() returns a promise; calling it inside the gesture is what counts.
    this.context.resume().catch(() => {});
    this.unlocked = true;
    for (const callback of this._onUnlock.splice(0)) callback();
    return true;
  }

  /**
   * Runs `callback` once audio is unlocked (now, if it already is).
   * @param {() => void} callback
   */
  whenUnlocked(callback) {
    if (this.unlocked) callback();
    else this._onUnlock.push(callback);
  }

  /**
   * Decodes a compressed sound bank.
   * @param {ArrayBuffer} bytes
   * @returns {Promise<AudioBuffer>}
   */
  decode(bytes) {
    const context = this.context ?? this._offlineDecoder();
    if (!context) return Promise.reject(new Error('Web Audio is not available'));
    return context.decodeAudioData(bytes);
  }

  /** Whether sound is actually playing (unlocked and the context running). */
  get running() {
    return this.context?.state === 'running';
  }

  /** The audio clock, seconds. */
  get now() {
    return this.context?.currentTime ?? 0;
  }

  /** Applies volume settings to the master and buses. */
  applyVolumes() {
    if (!this.context || !this.master) return;
    const now = this.context.currentTime;
    this.master.gain.setTargetAtTime(this.settings.get('audio.master'), now, 0.02);
    for (const name of BUSES) {
      this.buses[name].gain.setTargetAtTime(this.settings.get(`audio.${name}`), now, 0.02);
    }
  }

  /**
   * The pause menu: the world quietens, music drops back, the UI keeps its level.
   * @param {boolean} paused
   */
  setPaused(paused) {
    this.paused = paused;
    if (!this.context) return;
    this.world.gain.setTargetAtTime(paused ? WORLD_PAUSED : 1, this.context.currentTime, 0.08);
    this._applyMusicLevel();
  }

  /**
   * Ducks the music by `db` for `seconds` (voices, a stinger over the stems, Kelip's call). The deepest active duck wins.
   * @param {number} db negative
   * @param {number} seconds
   */
  duck(db, seconds) {
    if (db < this._duckDb || this._duckTime <= 0) this._duckDb = db;
    this._duckTime = Math.max(this._duckTime, seconds);
    this._applyMusicLevel();
  }

  /**
   * Per frame: releases ducking.
   * @param {number} dt real seconds
   */
  update(dt) {
    if (this._duckTime <= 0) return;
    this._duckTime -= dt;
    if (this._duckTime <= 0) {
      this._duckDb = 0;
      this._applyMusicLevel();
    }
  }

  /**
   * Moves the listener (the camera's view, at the player's distance).
   * @param {{ x: number, y: number, z: number }} position
   * @param {{ x: number, y: number, z: number }} forward normalised
   */
  setListener(position, forward) {
    this.listener.x = position.x;
    this.listener.y = position.y;
    this.listener.z = position.z;
    const listener = this.context?.listener;
    if (!listener) return;
    if (listener.positionX) {
      listener.positionX.value = position.x;
      listener.positionY.value = position.y;
      listener.positionZ.value = position.z;
      listener.forwardX.value = forward.x;
      listener.forwardY.value = forward.y;
      listener.forwardZ.value = forward.z;
      listener.upX.value = 0;
      listener.upY.value = 1;
      listener.upZ.value = 0;
    } else {
      listener.setPosition(position.x, position.y, position.z);
      listener.setOrientation(forward.x, forward.y, forward.z, 0, 1, 0);
    }
  }

  /** Suspends output (page hidden). */
  suspend() {
    this.context?.suspend().catch(() => {});
  }

  /** Resumes output (page visible again). */
  resume() {
    if (this.unlocked) this.context?.resume().catch(() => {});
  }

  /** Current state for the debug overlay. */
  get state() {
    return this.context ? this.context.state : 'locked';
  }

  /** @param {AudioContext} context */
  _build(context) {
    this.context = context;
    // A gentle limiter keeps stacked layers (stems, a stinger, a fight) from clipping on phone speakers.
    const limiter = context.createDynamicsCompressor();
    limiter.threshold.value = -4;
    limiter.knee.value = 4;
    limiter.ratio.value = 12;
    limiter.attack.value = 0.003;
    limiter.release.value = 0.2;
    limiter.connect(context.destination);
    this.master = context.createGain();
    this.master.connect(limiter);
    this.world = context.createGain();
    this.world.connect(this.master);
    this.musicDuck = context.createGain();
    this.musicDuck.connect(this.master);
    for (const name of BUSES) {
      const gain = context.createGain();
      gain.connect(name === 'music' ? this.musicDuck : WORLD_BUSES.includes(name) ? this.world : this.master);
      this.buses[name] = gain;
    }
    this.applyVolumes();
    if (this.paused) this.setPaused(true);
  }

  _offlineDecoder() {
    if (this._decoder) return this._decoder;
    const Ctor = globalThis.OfflineAudioContext || /** @type {any} */ (globalThis).webkitOfflineAudioContext;
    if (!Ctor) return null;
    this._decoder = new Ctor(1, 1, DECODE_RATE);
    return this._decoder;
  }

  _applyMusicLevel() {
    if (!this.context) return;
    const db = this._duckDb + (this.paused ? MUSIC_PAUSED_DB : 0);
    const level = dbToGain(db);
    if (level === this._musicLevel) return;
    // Duck in fast, come back slowly.
    const timeConstant = level < this._musicLevel ? 0.06 : 0.35;
    this._musicLevel = level;
    this.musicDuck.gain.setTargetAtTime(level, this.context.currentTime, timeConstant);
  }
}
