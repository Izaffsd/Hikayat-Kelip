import { dbToGain } from './AudioManager.js';

/**
 * The first grid line at or after `time`.
 * @param {number} time seconds (audio clock)
 * @param {number} origin when the stems started
 * @param {number} unit beat or bar length, seconds
 * @returns {number}
 */
export function nextBoundary(time, origin, unit) {
  if (time <= origin) return origin;
  return origin + Math.ceil((time - origin) / unit - 1e-9) * unit;
}

/**
 * The music state to play: a cutscene's choice, else a fight, else the mission's choice, else the region's default.
 * States a region does not have are skipped.
 * @param {string|null} scene a cutscene's state
 * @param {boolean} fighting
 * @param {string|null} override the mission's state
 * @param {Record<string, object>} states the region's states
 * @param {string} fallback the region's default
 * @returns {string}
 */
export function resolveMusicState(scene, fighting, override, states, fallback) {
  if (scene && Object.hasOwn(states, scene)) return scene;
  if (fighting && Object.hasOwn(states, 'combat')) return 'combat';
  if (override && Object.hasOwn(states, override)) return override;
  return fallback;
}

/**
 * A gain ramp as scheduled on the audio clock, so the level at any time is known without reading the AudioParam
 * (browsers disagree on `.value` during automation).
 */
export class Ramp {
  /** @param {number} value */
  constructor(value = 0) {
    this.from = value;
    this.to = value;
    this.t0 = 0;
    this.t1 = 0;
  }

  /**
   * @param {number} time
   * @returns {number}
   */
  valueAt(time) {
    if (time <= this.t0) return this.from;
    if (time >= this.t1) return this.to;
    return this.from + ((this.to - this.from) * (time - this.t0)) / (this.t1 - this.t0);
  }

  /**
   * Holds the current level until `at`, then ramps to `to` over `seconds`; reschedules `param` to match.
   * @param {AudioParam|null} param
   * @param {number} now
   * @param {number} at
   * @param {number} to
   * @param {number} seconds
   */
  schedule(param, now, at, to, seconds) {
    const value = this.valueAt(now);
    if (param) {
      param.cancelScheduledValues(now);
      param.setValueAtTime(value, now);
      param.setValueAtTime(value, at);
      param.linearRampToValueAtTime(to, at + seconds);
    }
    this.from = value;
    this.to = to;
    this.t0 = at;
    this.t1 = at + seconds;
  }
}

/**
 * The MusicSystem (TECHNICAL §10): each region's stems loop together from one start time on one tempo (gapless
 * AudioBufferSourceNode loops on the audio clock); a state is a mix of stem levels, and changes land on the next bar
 * (or beat, for a fight) and crossfade. Missions choose a state (`music` action), cutscenes choose one for their
 * length, and a running encounter means combat. Stingers play on the beat over ducked stems.
 */
export class MusicSystem {
  /**
   * @param {object} options
   * @param {import('./AudioManager.js').AudioManager} options.audio
   * @param {import('./SoundBank.js').SoundBank} options.bank
   * @param {import('./Sfx.js').Sfx} options.sfx
   * @param {{ fade: Record<string, number>, quantize: Record<string, string>, startDelay: number, stopFade: number,
   *   stingDuckDb: number }} options.config data/audio/regions.json `music`
   */
  constructor({ audio, bank, sfx, config }) {
    Object.assign(this, { audio, bank, sfx, config });
    /** @type {{ bank: string, default: string, states: Record<string, Record<string, number>>, pan?: object }|null} */
    this.region = null;
    this.regionId = null;
    /** State a cutscene asked for (cleared when it ends). */
    this.scene = null;
    /** State the mission asked for. */
    this.override = null;
    this.fighting = false;
    /** State playing (or scheduled to). */
    this.state = null;
    /** @type {Array<{ name: string, source: AudioBufferSourceNode, gain: GainNode, pan: AudioNode|null, ramp: Ramp }>|null} */
    this._stems = null;
    this._origin = 0;
    this._beat = 0.75;
    this._bar = 3;
    /** @type {GainNode|null} stems → music bus (stingers duck it) */
    this._stemBus = null;
  }

  /**
   * Switches to a region's score: the old stems fade out, the new ones start once their bank is decoded.
   * @param {string} id
   * @param {object|null} region data/audio/regions.json `regions[id].music`
   */
  setRegion(id, region) {
    if (this.regionId === id) return;
    this._stop(this.config.stopFade);
    this.regionId = id;
    this.region = region;
    this.scene = null;
    this.override = null;
    this.state = null;
  }

  /**
   * The mission's music (`{ "music": "danger" }`; null = back to the region's default).
   * @param {string|null} state
   */
  setOverride(state) {
    this.override = state;
  }

  /**
   * A cutscene's music, held until it ends.
   * @param {string|null} state
   */
  setScene(state) {
    this.scene = state;
  }

  /**
   * Plays a stinger on the next beat over ducked stems.
   * @param {string} id sound in the region's music bank
   */
  sting(id) {
    const audio = this.audio;
    if (!audio.running) return;
    const now = audio.now;
    const at = this._stems ? nextBoundary(now + 0.05, this._origin, this._beat) : now;
    const voice = this.sfx.play(id, { delay: at - now, bus: 'music', priority: 3 });
    if (!voice || !this._stemBus) return;
    const gain = this._stemBus.gain;
    gain.cancelScheduledValues(now);
    gain.setTargetAtTime(dbToGain(this.config.stingDuckDb), at, 0.05);
    gain.setTargetAtTime(1, at + voice.duration * 0.6, 0.8);
  }

  /**
   * Per frame: starts the stems when they can play and moves to the wanted state on the grid.
   * @param {boolean} fighting an encounter is running
   */
  update(fighting) {
    this.fighting = fighting;
    if (!this.region) return;
    if (!this._stems && !this._start()) return;
    const want = resolveMusicState(
      this.scene,
      fighting,
      this.override,
      this.region.states,
      this.region.default,
    );
    if (want !== this.state) this._transition(want);
  }

  /** Current stem levels (tests, debug overlay). */
  levels() {
    const now = this.audio.now;
    return Object.fromEntries(
      (this._stems ?? []).map((stem) => [stem.name, Math.round(stem.ramp.valueAt(now) * 100) / 100]),
    );
  }

  _start() {
    const audio = this.audio;
    const bankEntry = this.bank.banks.get(this.region.bank);
    if (!audio.running || !bankEntry) return false;
    const context = audio.context;
    const { music, loops } = /** @type {any} */ (bankEntry.entry);
    this._beat = 60 / music.bpm;
    this._bar = this._beat * music.beatsPerBar;
    this._origin = context.currentTime + this.config.startDelay;
    this._stemBus = context.createGain();
    this._stemBus.connect(audio.buses.music);
    this._stems = loops.map((name) => {
      const region = this.bank.pick(name, 0);
      const source = context.createBufferSource();
      source.buffer = region.buffer;
      source.loop = true;
      source.loopStart = region.offset;
      source.loopEnd = region.offset + region.duration;
      const gain = context.createGain();
      gain.gain.value = 0;
      source.connect(gain);
      let pan = null;
      const position = this.region.pan?.[name] ?? 0;
      if (position && context.createStereoPanner) {
        pan = context.createStereoPanner();
        pan.pan.value = position;
        gain.connect(pan);
        pan.connect(this._stemBus);
      } else {
        gain.connect(this._stemBus);
      }
      source.start(this._origin, region.offset);
      return { name, source, gain, pan, ramp: new Ramp(0) };
    });
    this.state = null;
    return true;
  }

  _transition(state) {
    const now = this.audio.now;
    const first = this.state === null;
    const quantize = this.config.quantize[state] ?? this.config.quantize.default;
    const unit = quantize === 'beat' ? this._beat : this._bar;
    const at = first ? Math.max(now, this._origin) : nextBoundary(now + 0.03, this._origin, unit);
    const seconds = this.config.fade[state] ?? this.config.fade.default;
    const mix = this.region.states[state] ?? {};
    for (const stem of this._stems) stem.ramp.schedule(stem.gain.gain, now, at, mix[stem.name] ?? 0, seconds);
    this.state = state;
  }

  _stop(seconds) {
    if (!this._stems) return;
    const now = this.audio.now;
    for (const stem of this._stems) {
      stem.ramp.schedule(stem.gain.gain, now, now, 0, seconds);
      stem.source.stop(now + seconds + 0.1);
      const { source, gain, pan } = stem;
      source.onended = () => {
        source.disconnect();
        gain.disconnect();
        pan?.disconnect();
      };
    }
    const stemBus = this._stemBus;
    setTimeout(() => stemBus?.disconnect(), (seconds + 0.5) * 1000);
    this._stems = null;
    this._stemBus = null;
    this.state = null;
  }
}
