import { EV } from '../core/events.js';
import { Ambience } from './Ambience.js';
import { Foley } from './Foley.js';
import { MusicSystem } from './MusicSystem.js';
import { Sfx } from './Sfx.js';
import { SoundBank } from './SoundBank.js';

/**
 * Whether an event payload meets a rule's `if`: each field equals a value, is one of a list, or is within
 * `{ min, max }`.
 * @param {Record<string, unknown>} condition
 * @param {Record<string, unknown>} payload
 * @returns {boolean}
 */
export function matches(condition, payload) {
  for (const [key, expected] of Object.entries(condition)) {
    const value = payload?.[key];
    if (Array.isArray(expected)) {
      if (!expected.includes(value)) return false;
    } else if (expected !== null && typeof expected === 'object') {
      const range = /** @type {{ min?: number, max?: number }} */ (expected);
      if (typeof value !== 'number') return false;
      if (range.min !== undefined && value < range.min) return false;
      if (range.max !== undefined && value > range.max) return false;
    } else if (value !== expected) {
      return false;
    }
  }
  return true;
}

/**
 * The game's sound (TECHNICAL §10): turns bus events into sounds through the data map (data/audio/sounds.json),
 * paces Bayu's footsteps, keeps the wind on the wau, rolls thunder after lightning, lets Kelip twinkle now and then,
 * and runs each region's ambience and music (data/audio/regions.json). Positions come from the engine (`locate`).
 */
export class AudioDirector {
  /**
   * @param {object} options
   * @param {import('./AudioManager.js').AudioManager} options.audio
   * @param {import('../core/EventBus.js').EventBus} options.bus
   * @param {any} options.sounds data/audio/sounds.json
   * @param {any} options.regions data/audio/regions.json
   * @param {{ enemy: (id: number) => ({ x: number, y: number, z: number }|null),
   *   kelip: () => ({ x: number, y: number, z: number }|null) }} options.locate
   * @param {() => 'wood'|'thatch'|'mud'|'water'} options.surfaceAt
   * @param {() => number} [options.random]
   */
  constructor({ audio, bus, sounds, regions, locate, surfaceAt, random = Math.random }) {
    Object.assign(this, { audio, bus, sounds, regions, locate, random });
    this.bank = new SoundBank(random);
    this.sfx = new Sfx({ audio, bank: this.bank, voices: sounds.voices });
    this.music = new MusicSystem({ audio, bank: this.bank, sfx: this.sfx, config: regions.musicSystem });
    this.ambience = new Ambience({ sfx: this.sfx, bank: this.bank, config: regions.ambience, random });
    this.foley = new Foley({
      play: (id, options) => this.sfx.play(id, options),
      surfaceAt,
      tuning: sounds.foley,
      random,
    });
    this.regionId = null;
    /** @type {import('./Sfx.js').LoopVoice|null} */
    this._glide = null;
    this._kelipTimer = this._between(sounds.kelip.every);
    /** @type {Array<() => void>} */
    this._offs = [];
    this._bind();
  }

  /**
   * Bank ids (manifest `audio/<id>`) the region needs: the global ones, its own, its ambience beds and its music.
   * @param {string|null} regionId
   * @returns {string[]}
   */
  banksFor(regionId) {
    const region = regionId ? this.regions.regions[regionId] : null;
    const ids = new Set(this.regions.global);
    if (region) {
      for (const id of region.banks) ids.add(id);
      for (const mix of Object.values(region.ambience)) for (const id of Object.keys(mix)) ids.add(id);
      for (const list of Object.values(region.sprinkles ?? {}))
        for (const sprinkle of list) ids.add(sprinkle.bank);
      if (region.music) ids.add(region.music.bank);
    }
    return [...ids];
  }

  /**
   * A decoded bank arrived.
   * @param {string} id
   * @param {any} entry manifest entry
   * @param {AudioBuffer} buffer
   */
  addBank(id, entry, buffer) {
    this.bank.add(id, entry, buffer);
  }

  /** @param {string} id */
  removeBank(id) {
    this.bank.remove(id);
  }

  /**
   * Switches ambience and music to a region (null: silence while the next one loads).
   * @param {string|null} id
   */
  setRegion(id) {
    this.regionId = id;
    const region = id ? (this.regions.regions[id] ?? null) : null;
    this.music.setRegion(id, region?.music ?? null);
    this.ambience.setRegion(region?.ambience ?? null, region?.sprinkles ?? null);
    this._glideOpen(false);
  }

  /**
   * One fixed tick: footsteps.
   * @param {number} dt
   * @param {string} state traversal state
   * @param {number} speed horizontal m/s
   */
  fixedUpdate(dt, state, speed) {
    this.foley.fixedUpdate(dt, state, speed);
  }

  /**
   * One frame.
   * @param {number} dt real seconds
   * @param {object} view
   * @param {{ x: number, y: number, z: number }} view.listener where the player hears from
   * @param {{ x: number, y: number, z: number }} view.forward camera forward
   * @param {string|null} view.preset light preset (ambience mix)
   * @param {boolean} view.fighting an encounter is running (combat music)
   * @param {number} view.glideSpeed m/s while gliding
   * @param {boolean} view.paused world clocks stopped
   */
  frameUpdate(dt, { listener, forward, preset, fighting, glideSpeed, paused }) {
    const audio = this.audio;
    audio.update(dt);
    if (!audio.running) return;
    audio.setListener(listener, forward);
    this.ambience.update(preset, paused ? 0 : dt);
    this.music.update(fighting);
    if (this._glide) {
      const g = this.sounds.glide;
      const k = Math.min(1, Math.max(0, (glideSpeed - g.minSpeed) / (g.maxSpeed - g.minSpeed)));
      this._glide.fadeTo(Math.round(g.gain[0] + (g.gain[1] - g.gain[0]) * k), 0.3);
      this._glide.setRate(g.rate[0] + (g.rate[1] - g.rate[0]) * k);
    }
    if (paused) return;
    const kelip = this.locate.kelip();
    if (!kelip) return;
    this._kelipTimer -= dt;
    if (this._kelipTimer > 0) return;
    this._kelipTimer = this._between(this.sounds.kelip.every);
    this.sfx.play(this.sounds.kelip.sound, {
      at: kelip,
      gain: this.sounds.kelip.gain,
      rate: 0.9 + this.random() * 0.2,
    });
  }

  /** Plays and counters for tests and the debug overlay. */
  stats() {
    return {
      state: this.audio.state,
      banks: [...this.bank.banks.keys()],
      voices: this.sfx.active,
      played: Object.fromEntries(this.sfx.counts),
      music: {
        state: this.music.state,
        scene: this.music.scene,
        override: this.music.override,
        levels: this.music.levels(),
      },
      ambience: this.ambience.levels(),
      steps: this.foley.steps,
    };
  }

  dispose() {
    for (const off of this._offs) off();
    this._offs.length = 0;
  }

  _bind() {
    const { bus, sounds, music, audio } = this;
    const on = (event, handler) => this._offs.push(bus.on(event, handler));
    for (const [event, rules] of Object.entries(sounds.events))
      on(event, (payload) => this._fire(rules, payload));
    on(EV.PLAYER_LANDED, ({ speed }) => this.foley.land(speed));
    on(EV.PLAYER_GLIDE, ({ open }) => this._glideOpen(open));
    on(EV.LIGHTNING, ({ delay }) =>
      this.sfx.play(sounds.thunder.sound, {
        delay,
        gain: sounds.thunder.gain,
        priority: sounds.thunder.priority,
      }),
    );
    on(EV.SOUND, (request) => this.sfx.play(request.id, request));
    on(EV.MUSIC, ({ state, scene }) => (scene ? music.setScene(state) : music.setOverride(state)));
    on(EV.MUSIC_STING, ({ id }) => music.sting(id));
    on(EV.CUTSCENE_ENDED, () => music.setScene(null));
    on(EV.PAUSE_CHANGED, ({ paused }) => audio.setPaused(paused));
    on(EV.RACE_FINISHED, ({ won, cancelled }) => {
      if (won && !cancelled) music.sting('sting_win');
    });
    on(EV.TRIAL_FINISHED, ({ medal }) => {
      if (medal) music.sting('sting_win');
    });
    on(EV.REGION_CHANGE, () => this.setRegion(null));
  }

  _fire(rules, payload) {
    for (const rule of rules) {
      if (rule.if && !matches(rule.if, payload)) continue;
      const at =
        rule.at === 'enemy'
          ? this.locate.enemy(payload.id)
          : rule.at === 'kelip'
            ? this.locate.kelip()
            : null;
      const rate = Array.isArray(rule.rate)
        ? rule.rate[0] + (rule.rate[1] - rule.rate[0]) * this.random()
        : (rule.rate ?? 1);
      const voice = this.sfx.play(rule.sound, {
        at,
        gain: rule.gain ?? 0,
        rate,
        delay: rule.delay ?? 0,
        priority: rule.priority ?? 1,
      });
      if (voice && rule.duck) this.audio.duck(rule.duck, (rule.delay ?? 0) + voice.duration);
    }
  }

  _glideOpen(open) {
    if (!open) {
      this._glide?.stop(0.4);
      this._glide = null;
      return;
    }
    if (this._glide) return;
    const g = this.sounds.glide;
    this.sfx.play(g.open, { gain: -4, rate: 0.9 });
    this._glide = this.sfx.loop(g.sound, { gain: g.gain[0], fade: 0.4 });
  }

  _between([low, high]) {
    return low + (high - low) * this.random();
  }
}
