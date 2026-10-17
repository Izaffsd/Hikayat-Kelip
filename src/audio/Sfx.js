import { dbToGain } from './AudioManager.js';

/**
 * @typedef {object} PlayOptions
 * @property {{ x: number, y: number, z: number }|null} [at] world position (positional, distance-culled)
 * @property {number} [gain=0] dB
 * @property {number} [rate=1] playback rate (pitch)
 * @property {number} [delay=0] seconds from now
 * @property {number} [priority=1] higher survives voice stealing
 * @property {string} [bus] override the bank's bus
 * @property {number} [variant=-1]
 * @property {number} [ref] distance (m) within which a positional sound plays at full level (default: voices.refDistance)
 */

/**
 * The voice limit (TECHNICAL §10: at most N one-shots at once). When full, a new sound takes the slot of the oldest
 * voice of the lowest priority, unless every playing voice outranks it. Pure bookkeeping, so it is unit-tested.
 */
export class VoicePool {
  /** @param {number} max */
  constructor(max) {
    this.max = max;
    /** @type {Array<{ priority: number, started: number }>} */
    this.voices = [];
  }

  /**
   * Makes room for a voice of `priority`.
   * @param {number} priority
   * @returns {{ ok: boolean, evict: object|null }} ok: it may play; evict: the voice to stop first
   */
  admit(priority) {
    if (this.voices.length < this.max) return { ok: true, evict: null };
    let victim = null;
    for (const voice of this.voices) {
      if (
        !victim ||
        voice.priority < victim.priority ||
        (voice.priority === victim.priority && voice.started < victim.started)
      )
        victim = voice;
    }
    if (!victim || victim.priority > priority) return { ok: false, evict: null };
    return { ok: true, evict: victim };
  }

  /** @param {object} voice */
  add(voice) {
    this.voices.push(voice);
  }

  /** @param {object} voice */
  remove(voice) {
    const index = this.voices.indexOf(voice);
    if (index < 0) return;
    this.voices[index] = this.voices[this.voices.length - 1];
    this.voices.pop();
  }
}

/**
 * Plays one-shots and loops from the SoundBank on the AudioManager's buses: positional sounds through a PannerNode
 * (HRTF on High, equal-power otherwise), culled beyond `maxDistance`, under the voice limit.
 */
export class Sfx {
  /**
   * @param {object} options
   * @param {import('./AudioManager.js').AudioManager} options.audio
   * @param {import('./SoundBank.js').SoundBank} options.bank
   * @param {{ max: number, maxDistance: number, refDistance: number, rolloff: number }} options.voices
   */
  constructor({ audio, bank, voices }) {
    this.audio = audio;
    this.bank = bank;
    this.config = voices;
    this.pool = new VoicePool(voices.max);
    this.hrtf = false;
    /** Plays per sound id since boot (tests and the debug overlay). */
    this.counts = new Map();
    this._clock = 0;
  }

  /**
   * Plays a one-shot.
   * @param {string} id
   * @param {PlayOptions} [options]
   * @returns {object|null} the voice, or null when it did not play (locked, unknown, culled, no free voice)
   */
  play(id, { at = null, gain = 0, rate = 1, delay = 0, priority = 1, bus, variant = -1, ref } = {}) {
    const audio = this.audio;
    if (!audio.running) return null;
    const region = this.bank.pick(id, variant);
    if (!region) return null;
    if (at && this._distance(at) > this.config.maxDistance) return null;
    const { ok, evict } = this.pool.admit(priority);
    if (!ok) return null;
    if (evict) this._stop(evict);
    const context = audio.context;
    const source = context.createBufferSource();
    source.buffer = region.buffer;
    source.playbackRate.value = rate;
    const amp = context.createGain();
    amp.gain.value = dbToGain(gain);
    source.connect(amp);
    let panner = null;
    if (at) {
      panner = this._panner(at, ref ?? this.config.refDistance);
      amp.connect(panner);
      panner.connect(audio.buses[bus ?? region.bus]);
    } else {
      amp.connect(audio.buses[bus ?? region.bus]);
    }
    const voice = {
      source,
      amp,
      panner,
      priority,
      started: this._clock++,
      duration: region.duration,
      released: false,
    };
    source.onended = () => this._release(voice);
    source.start(context.currentTime + Math.max(0, delay), region.offset, region.duration);
    this.pool.add(voice);
    this.counts.set(id, (this.counts.get(id) ?? 0) + 1);
    return voice;
  }

  /**
   * Starts a looping sound (an ambience bed, the wind on the wau) at silence and fades it to `gain`. `wide` plays two
   * copies half a loop apart, panned to ±wide, so a mono bed fills the stereo field.
   * @param {string} id
   * @param {{ gain?: number, fade?: number, bus?: string, wide?: number }} [options]
   * @returns {LoopVoice|null}
   */
  loop(id, { gain = 0, fade = 1, bus, wide = 0 } = {}) {
    const audio = this.audio;
    if (!audio.context) return null;
    const region = this.bank.pick(id, 0);
    if (!region) return null;
    const context = audio.context;
    const amp = context.createGain();
    amp.gain.value = 0;
    amp.connect(audio.buses[bus ?? region.bus]);
    const pans = wide > 0 && context.createStereoPanner ? [-wide, wide] : [0];
    const sources = [];
    const nodes = [amp];
    pans.forEach((pan, index) => {
      const source = context.createBufferSource();
      source.buffer = region.buffer;
      source.loop = true;
      source.loopStart = region.offset;
      source.loopEnd = region.offset + region.duration;
      if (pans.length > 1) {
        const trim = context.createGain();
        trim.gain.value = Math.SQRT1_2;
        const panner = context.createStereoPanner();
        panner.pan.value = pan;
        source.connect(trim);
        trim.connect(panner);
        panner.connect(amp);
        nodes.push(trim, panner);
      } else {
        source.connect(amp);
      }
      source.start(context.currentTime, region.offset + (index * region.duration) / pans.length);
      sources.push(source);
    });
    const voice = new LoopVoice(context, sources, nodes);
    voice.fadeTo(gain, fade);
    this.counts.set(id, (this.counts.get(id) ?? 0) + 1);
    return voice;
  }

  /** Number of one-shots playing. */
  get active() {
    return this.pool.voices.length;
  }

  _distance(at) {
    const l = this.audio.listener;
    return Math.hypot(at.x - l.x, at.y - l.y, at.z - l.z);
  }

  _panner(at, refDistance) {
    const panner = this.audio.context.createPanner();
    panner.panningModel = this.hrtf ? 'HRTF' : 'equalpower';
    panner.distanceModel = 'inverse';
    panner.refDistance = refDistance;
    panner.maxDistance = this.config.maxDistance;
    panner.rolloffFactor = this.config.rolloff;
    if (panner.positionX) {
      panner.positionX.value = at.x;
      panner.positionY.value = at.y;
      panner.positionZ.value = at.z;
    } else {
      panner.setPosition(at.x, at.y, at.z);
    }
    return panner;
  }

  _stop(voice) {
    try {
      voice.source.stop();
    } catch {
      // already stopped
    }
    this._release(voice);
  }

  _release(voice) {
    if (voice.released) return;
    voice.released = true;
    this.pool.remove(voice);
    voice.source.onended = null;
    voice.source.disconnect();
    voice.amp.disconnect();
    voice.panner?.disconnect();
  }
}

/** A playing loop: fade it, then stop it. */
export class LoopVoice {
  /**
   * @param {AudioContext} context
   * @param {AudioBufferSourceNode[]} sources
   * @param {AudioNode[]} nodes the level (first) and any per-copy nodes
   */
  constructor(context, sources, nodes) {
    this.context = context;
    this.sources = sources;
    this.amp = /** @type {GainNode} */ (nodes[0]);
    this._nodes = nodes;
    this.gainDb = -Infinity;
    this.stopped = false;
  }

  /**
   * @param {number} db target level (−Infinity = silent)
   * @param {number} seconds
   */
  fadeTo(db, seconds) {
    if (this.stopped || db === this.gainDb) return;
    this.gainDb = db;
    const target = db === -Infinity ? 0 : dbToGain(db);
    this.amp.gain.setTargetAtTime(target, this.context.currentTime, Math.max(0.01, seconds / 3));
  }

  /** @param {number} rate */
  setRate(rate) {
    if (this.stopped) return;
    for (const source of this.sources)
      source.playbackRate.setTargetAtTime(rate, this.context.currentTime, 0.1);
  }

  /**
   * Fades out and stops.
   * @param {number} [seconds=0.5]
   */
  stop(seconds = 0.5) {
    if (this.stopped) return;
    this.fadeTo(-Infinity, seconds);
    this.stopped = true;
    const { sources, _nodes: nodes } = this;
    sources[0].onended = () => {
      for (const source of sources) source.disconnect();
      for (const node of nodes) node.disconnect();
    };
    for (const source of sources) source.stop(this.context.currentTime + seconds + 0.05);
  }
}
