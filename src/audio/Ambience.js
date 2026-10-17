/**
 * Ambience beds per region and lighting mood (GDD "Art and audio direction": night insects and lapping water in
 * Kampung Berembang; rain and wind in the storm). Each bed is a seamless loop; when the light preset changes (dusk
 * into night) the beds crossfade to that preset's mix.
 */
export class Ambience {
  /**
   * @param {object} options
   * @param {import('./Sfx.js').Sfx} options.sfx
   * @param {import('./SoundBank.js').SoundBank} options.bank
   * @param {{ fade: number, stopFade: number, wide: number }} options.config data/audio/regions.json `ambience`
   */
  constructor({ sfx, bank, config }) {
    Object.assign(this, { sfx, bank, config });
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
   */
  setRegion(mixes) {
    for (const bed of this.beds.values()) bed.stop(this.config.stopFade);
    this.beds.clear();
    this.mixes = mixes;
    this._mix = null;
    this._complete = false;
  }

  /**
   * Per frame: follows the light preset. Beds whose bank arrives later start then.
   * @param {string|null} preset current light preset
   */
  update(preset) {
    if (!this.mixes || !this.sfx.audio.running) return;
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

  /** Names of the beds playing and their levels (tests). */
  levels() {
    return Object.fromEntries([...this.beds].map(([sound, bed]) => [sound, bed.gainDb]));
  }
}
