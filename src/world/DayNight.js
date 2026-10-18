import { Color, DirectionalLight, Fog, HemisphereLight, PointLight, Vector3 } from 'three/webgpu';
import { data } from '../core/Data.js';
import { EV } from '../core/events.js';
import { ENV } from '../render/environment.js';
import { GRADE } from '../render/grade.js';
import { PLAYER_RIM } from '../render/rimMaterial.js';

/**
 * Lighting moods (TECHNICAL §4.3), from data/lighting.json: each preset sets the hemisphere and key light, fog, sky
 * gradient, moon, clouds, stars, water tint and colour grade together, so a region looks coherent; `blendTo`
 * crossfades between presets over seconds (Chapter 1 goes from dusk to night). The storm preset fires lightning with a
 * delayed thunder event.
 */
const LIGHTING = data('lighting');

const COLOR_KEYS = [
  'hemiSky',
  'hemiGround',
  'key',
  'fog',
  'horizon',
  'zenith',
  'sunGlow',
  'waterDeep',
  'waterShallow',
  'waterSky',
  'gradeGain',
  'gradeLift',
];
const NUMBER_KEYS = [
  'hemi',
  'keyIntensity',
  'fogNear',
  'fogFar',
  'stars',
  'clouds',
  'moon',
  'choppiness',
  'glint',
  'exposure',
  'playerRim',
  'saturation',
  'contrast',
];

export class DayNight {
  /**
   * @param {object} options
   * @param {import('three').Scene} options.scene
   * @param {import('./Sky.js').Sky} options.sky
   * @param {import('./Water.js').Water|null} options.water
   * @param {import('../render/Renderer.js').Renderer} options.renderer
   * @param {import('../core/EventBus.js').EventBus} options.bus
   * @param {number} [options.lampLights=4] point lights in the lamp pool
   */
  constructor({ scene, sky, water, renderer, bus, lampLights = 4 }) {
    this.scene = scene;
    this.sky = sky;
    this.water = water;
    this.renderer = renderer;
    this.bus = bus;
    this.hemi = new HemisphereLight(0xffffff, 0x000000, 1);
    this.key = new DirectionalLight(0xffffff, 1);
    this.key.position.set(30, 50, 20);
    scene.add(this.hemi, this.key, this.key.target);
    scene.fog = new Fog(0x000000, 30, 200);
    /** Current values (colours as Color, numbers as number); blends write into it in place. */
    this.current = this._snapshot(LIGHTING.presets.night);
    this._from = this._snapshot(LIGHTING.presets.night);
    this._to = this._snapshot(LIGHTING.presets.night);
    this._blend = 1;
    this._blendTime = 1;
    this._keyDir = new Vector3();
    this.flash = 0;
    this._nextFlash = 6;
    this._flashTime = -1;
    this.storm = false;
    /** @type {Array<{ position: Vector3, kind: string, phase: number }>} */
    this.lamps = [];
    this.pool = Array.from({ length: lampLights }, () => {
      const light = new PointLight(0xffa04a, 0, 9, 1.8);
      scene.add(light);
      return light;
    });
    this._lampTimer = 0;
    this._time = 0;
    /** @type {string|null} name of the preset shown (or blending in) */
    this.preset = null;
  }

  /**
   * Applies a preset immediately.
   * @param {string} name a preset of data/lighting.json
   */
  set(name) {
    this.preset = name;
    this._copy(this._to, DayNight.preset(name));
    this._copy(this.current, this._to);
    this._blend = 1;
    this.storm = name === 'storm';
    this._apply(this.current);
  }

  /**
   * Crossfades to a preset.
   * @param {string} name a preset of data/lighting.json
   * @param {number} seconds
   */
  blendTo(name, seconds) {
    this.preset = name;
    this._copy(this._from, this.current);
    this._copy(this._to, DayNight.preset(name));
    this._blend = 0;
    this._blendTime = Math.max(0.01, seconds);
    this.storm = name === 'storm';
  }

  /**
   * A preset's values (throws on an unknown name, so a typo in mission data fails loudly).
   * @param {string} name
   * @returns {object}
   */
  static preset(name) {
    const preset = LIGHTING.presets[name];
    if (!preset) throw new Error(`Unknown lighting preset "${name}"`);
    return preset;
  }

  /**
   * Lamp anchors for the point-light pool (pelita flames, Kelip lanterns).
   * @param {Array<{ position: Vector3, kind: string }>} lamps
   */
  setLamps(lamps) {
    this.lamps = lamps.map((lamp, i) => ({ ...lamp, phase: i * 1.7 }));
  }

  /**
   * @param {number} dt
   * @param {Vector3} focus where the lamp pool should concentrate (the player)
   */
  update(dt, focus) {
    this._time += dt;
    if (this._blend < 1) {
      this._blend = Math.min(1, this._blend + dt / this._blendTime);
      const t = this._blend * this._blend * (3 - 2 * this._blend);
      const mixed = this.current;
      for (const key of COLOR_KEYS) mixed[key].copy(this._from[key]).lerp(this._to[key], t);
      for (const key of NUMBER_KEYS) mixed[key] = this._from[key] + (this._to[key] - this._from[key]) * t;
      mixed.keyDir.copy(this._from.keyDir).lerp(this._to.keyDir, t).normalize();
      this._apply(mixed);
    }
    this._lightning(dt);
    this._lamps(dt, focus);
  }

  /**
   * A lightning strike now (a story near-miss); thunder follows after `delay` seconds (short = close). Storm only.
   * @param {number} [delay=0.15]
   */
  strike(delay = 0.15) {
    if (!this.storm) return;
    this._flashTime = 0;
    this._nextFlash = 7 + Math.random() * 9;
    this.bus.emit(EV.LIGHTNING, { delay });
  }

  _lightning(dt) {
    if (!this.storm) {
      this.flash = 0;
    } else {
      this._nextFlash -= dt;
      if (this._nextFlash <= 0) {
        this._flashTime = 0;
        this._nextFlash = 7 + Math.random() * 9;
        this.bus.emit(EV.LIGHTNING, { delay: 0.6 + Math.random() * 1.6 });
      }
      if (this._flashTime >= 0) {
        this._flashTime += dt;
        const t = this._flashTime;
        // Two quick pulses, then decay.
        this.flash = Math.max(Math.exp(-t * 18), t > 0.12 ? Math.exp(-(t - 0.12) * 9) * 0.8 : 0);
        if (t > 0.9) this._flashTime = -1;
      } else {
        this.flash = 0;
      }
    }
    this.sky.uniforms.flash.value = this.flash;
    this.hemi.intensity = this.current.hemi * (1 + this.flash * 2.2);
  }

  _lamps(dt, focus) {
    this._lampTimer -= dt;
    if (this._lampTimer <= 0 && focus) {
      this._lampTimer = 0.4;
      const nearest = this.lamps
        .map((lamp) => ({ lamp, d: lamp.position.distanceToSquared(focus) }))
        .sort((a, b) => a.d - b.d)
        .slice(0, this.pool.length);
      this.pool.forEach((light, i) => {
        const entry = nearest[i];
        light.userData.lamp = entry?.lamp ?? null;
        if (entry) light.position.copy(entry.lamp.position);
      });
    }
    for (const light of this.pool) {
      const lamp = light.userData.lamp;
      if (!lamp) {
        light.intensity = 0;
        continue;
      }
      // Lamps can move (Kelip follows Bayu): track them every frame.
      light.position.copy(lamp.position);
      const flicker =
        lamp.kind === 'pelita'
          ? 0.85 + 0.15 * Math.sin(this._time * 13 + lamp.phase) * Math.sin(this._time * 7.3)
          : 1;
      const look = LIGHTING.lamps[lamp.kind] ?? LIGHTING.lamps.pelita;
      light.color.set(look.color);
      light.intensity = look.intensity * flicker * (lamp.intensity ?? 1);
    }
  }

  /**
   * Adds one lamp to the pool's candidates (a moving light such as Kelip); returns it so the owner can move it.
   * @param {{ position: Vector3, kind: string, intensity?: number }} lamp
   * @returns {{ position: Vector3, kind: string, phase: number, intensity?: number }}
   */
  addLamp(lamp) {
    const entry = { ...lamp, phase: this.lamps.length * 1.7 };
    this.lamps.push(entry);
    this._lampTimer = 0;
    return entry;
  }

  /** A fresh set of values from a preset (allocates; construction only). */
  _snapshot(source) {
    const out = {};
    for (const key of COLOR_KEYS) out[key] = new Color();
    out.keyDir = new Vector3();
    return this._copy(out, source);
  }

  /** Copies values (a preset from data, or another set) into `out` without allocating. */
  _copy(out, source) {
    for (const key of COLOR_KEYS) out[key].set(source[key]);
    for (const key of NUMBER_KEYS) out[key] = source[key];
    if (Array.isArray(source.keyDir))
      out.keyDir.set(source.keyDir[0], source.keyDir[1], source.keyDir[2]).normalize();
    else out.keyDir.copy(source.keyDir);
    return out;
  }

  _apply(values) {
    this.current = values;
    this.hemi.color.copy(values.hemiSky);
    this.hemi.groundColor.copy(values.hemiGround);
    this.hemi.intensity = values.hemi;
    this.key.color.copy(values.key);
    this.key.intensity = values.keyIntensity;
    this.key.position.copy(values.keyDir).multiplyScalar(60);
    this.scene.fog.color.copy(values.fog);
    this.scene.fog.near = values.fogNear;
    this.scene.fog.far = values.fogFar;
    const su = this.sky.uniforms;
    su.horizon.value.copy(values.horizon);
    su.zenith.value.copy(values.zenith);
    su.stars.value = values.stars;
    su.clouds.value = values.clouds;
    su.sunGlow.value.copy(values.sunGlow);
    su.moonDir.value.copy(values.keyDir);
    su.moonColor.value.setRGB(0.91, 0.93, 1).multiplyScalar(values.moon);
    if (this.water) {
      const wu = this.water.uniforms;
      wu.deep.value.copy(values.waterDeep);
      wu.shallow.value.copy(values.waterShallow);
      wu.sky.value.copy(values.waterSky);
      wu.moonDir.value.copy(values.keyDir);
      wu.moonColor.value.copy(values.key);
      wu.choppiness.value = values.choppiness;
      wu.glint.value = values.glint;
    }
    this.renderer.three.toneMappingExposure = values.exposure;
    PLAYER_RIM.value = values.playerRim;
    GRADE.gain.value.copy(values.gradeGain);
    GRADE.lift.value.copy(values.gradeLift);
    GRADE.saturation.value = values.saturation;
    GRADE.contrast.value = values.contrast;
    ENV.waterSky.value.copy(values.waterSky);
  }

  dispose() {
    this.scene.remove(this.hemi, this.key, this.key.target, ...this.pool);
    this.scene.fog = null;
  }
}
