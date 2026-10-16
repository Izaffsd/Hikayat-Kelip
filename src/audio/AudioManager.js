import { setupAudioSession } from '../core/Platform.js';

/** Mixer buses (TECHNICAL §10). */
export const BUSES = Object.freeze(['music', 'ambience', 'sfx', 'voice', 'ui']);

/**
 * Owns the Web Audio graph: master → buses. Created and resumed inside the first user gesture
 * (the title tap), with the iOS audio session set to "playback" so sound plays with the silent switch on.
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
    this.unlocked = false;
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
    if (!this.context) {
      this.context = new Ctor({ latencyHint: 'interactive' });
      this.master = this.context.createGain();
      this.master.connect(this.context.destination);
      for (const name of BUSES) {
        const gain = this.context.createGain();
        gain.connect(this.master);
        this.buses[name] = gain;
      }
      this.applyVolumes();
    }
    // resume() returns a promise; calling it inside the gesture is what counts.
    this.context.resume().catch(() => {});
    this.unlocked = true;
    return true;
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
}
