/**
 * Ambience per region and lighting mood (GDD "Art and audio direction": night insects and lapping water in Kampung
 * Berembang; rain and wind in the storm; wind through the rice and buffalo bells in Sawah Emas). Beds are seamless
 * loops that crossfade to the preset's mix when the light changes (dusk into night); sprinkles are one-shots played
 * now and then somewhere around the listener (a bell across the field, a bird).
 */
export class Ambience {
  /**
   * @param {object} options
   * @param {import('./Sfx.js').Sfx} options.sfx
   * @param {import('./SoundBank.js').SoundBank} options.bank
   * @param {{ fade: number, stopFade: number, wide: number }} options.config data/audio/regions.json `ambience`
   * @param {() => number} [options.random]
   */
  constructor({ sfx, bank, config, random = Math.random }) {
    Object.assign(this, { sfx, bank, config, random });
    /** @type {Record<string, Array<{ sound: string, every: number[], gain: number, distance: number[] }>>|null} */
    this.sprinkles = null;
    /** @type {Array<{ sound: string, every: number[], gain: number, distance: number[] }>|null} */
    this._sprinkleList = null;
    /** Seconds until each sprinkle of the current list plays. */
    this._timers = [];
    this._spot = { x: 0, y: 0, z: 0 };
    /** @type {Record<string, Record<string, number>>|null} preset → bed → dB */
    this.mixes = null;
    /** @type {Map<string, import('./Sfx.js').LoopVoice>} */
    this.beds = new Map();
    /** @type {Record<string, number>|null} */
    this._mix = null;
    /** Every bed of the current mix is playing (nothing to do until the mix changes). */
    this._complete = false;
  }

  /**
   * Fades out the old region's beds; the new ones come in on the next update.
   * @param {Record<string, Record<string, number>>|null} mixes data/audio/regions.json `regions[id].ambience`
   * @param {object|null} [sprinkles] data/audio/regions.json `regions[id].sprinkles` (preset → list)
   */
  setRegion(mixes, sprinkles = null) {
    for (const bed of this.beds.values()) bed.stop(this.config.stopFade);
    this.beds.clear();
    this.mixes = mixes;
    this.sprinkles = sprinkles;
    this._sprinkleList = null;
    this._mix = null;
    this._complete = false;
  }

  /**
   * Per frame: follows the light preset. Beds whose bank arrives later start then.
   * @param {string|null} preset current light preset
   * @param {number} [dt=0] seconds (sprinkles)
   */
  update(preset, dt = 0) {
    if (!this.sfx.audio.running) return;
    this._sprinkle(preset, dt);
    if (!this.mixes) return;
    const mix = (preset && this.mixes[preset]) || this.mixes.default || Object.values(this.mixes)[0];
    if (!mix || (mix === this._mix && this._complete)) return;
    const changed = mix !== this._mix;
    this._mix = mix;
    let complete = true;
    for (const sound in mix) {
      const db = mix[sound];
      let bed = this.beds.get(sound);
      if (!bed) {
        bed = this.bank.has(sound) ? this.sfx.loop(sound, { gain: -Infinity, wide: this.config.wide }) : null;
        if (!bed) {
          complete = false;
          continue;
        }
        this.beds.set(sound, bed);
      } else if (!changed) {
        continue;
      }
      bed.fadeTo(db, this.config.fade);
    }
    this._complete = complete;
    if (!changed) return;
    for (const [sound, bed] of this.beds) if (!(sound in mix)) bed.fadeTo(-Infinity, this.config.fade);
  }

  /** Plays the preset's sprinkles when their timers run out, at a random spot around the listener. */
  _sprinkle(preset, dt) {
    const list = (this.sprinkles && ((preset && this.sprinkles[preset]) || this.sprinkles.default)) || null;
    if (list !== this._sprinkleList) {
      this._sprinkleList = list;
      this._timers.length = 0;
      for (const sprinkle of list ?? []) this._timers.push(this._between(sprinkle.every));
    }
    if (!list) return;
    const listener = this.sfx.audio.listener;
    for (let i = 0; i < list.length; i++) {
      this._timers[i] -= dt;
      if (this._timers[i] > 0) continue;
      const sprinkle = list[i];
      this._timers[i] = this._between(sprinkle.every);
      const angle = this.random() * Math.PI * 2;
      const distance = this._between(sprinkle.distance);
      this._spot.x = listener.x + Math.cos(angle) * distance;
      this._spot.y = listener.y + 1;
      this._spot.z = listener.z + Math.sin(angle) * distance;
      this.sfx.play(sprinkle.sound, {
        at: this._spot,
        gain: sprinkle.gain,
        rate: 0.92 + this.random() * 0.16,
      });
    }
  }

  _between([low, high]) {
    return low + (high - low) * this.random();
  }

  /** Names of the beds playing and their levels (tests). */
  levels() {
    return Object.fromEntries([...this.beds].map(([sound, bed]) => [sound, bed.gainDb]));
  }
}
