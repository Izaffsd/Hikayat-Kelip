import { Color, DirectionalLight, Fog, HemisphereLight, PointLight, Vector3 } from 'three/webgpu';
import { EV } from '../core/events.js';
import { PLAYER_RIM } from '../render/rimMaterial.js';

/**
 * Lighting moods (TECHNICAL §4.3). Each preset sets the hemisphere and key light, fog, sky gradient, moon, clouds,
 * stars and water tint together, so a region looks coherent; `blendTo` crossfades between presets over seconds
 * (Chapter 1 goes from dusk to night). The storm preset fires lightning with a delayed thunder event.
 */
export const LIGHT_PRESETS = {
  storm: {
    hemiSky: 0x5a6c96,
    hemiGround: 0x1a1c26,
    hemi: 1.9,
    key: 0xa8bcf0,
    keyIntensity: 1.1,
    keyDir: [0.3, 0.75, -0.55],
    fog: 0x141c30,
    fogNear: 22,
    fogFar: 150,
    horizon: 0x253049,
    zenith: 0x080b16,
    stars: 0,
    clouds: 1,
    moon: 0,
    sunGlow: 0x000000,
    waterDeep: 0x0a1424,
    waterShallow: 0x1a2c44,
    waterSky: 0x34425e,
    choppiness: 1.6,
    glint: 0,
    exposure: 1.3,
    playerRim: 0.32,
  },
  dusk: {
    hemiSky: 0xd89a78,
    hemiGround: 0x2b2238,
    hemi: 1.05,
    key: 0xffb27a,
    keyIntensity: 1.35,
    keyDir: [-0.8, 0.22, 0.45],
    fog: 0x6b5a78,
    fogNear: 60,
    fogFar: 320,
    horizon: 0xe08a62,
    zenith: 0x2a3466,
    stars: 0.15,
    clouds: 0.25,
    moon: 0.6,
    sunGlow: 0xff8a4a,
    waterDeep: 0x1a2440,
    waterShallow: 0x4a4466,
    waterSky: 0xc98a72,
    choppiness: 0.8,
    glint: 0.6,
    exposure: 1.0,
    playerRim: 0.06,
  },
  night: {
    hemiSky: 0x3e5088,
    hemiGround: 0x0c0f18,
    hemi: 0.95,
    key: 0xb8c8ff,
    keyIntensity: 0.75,
    keyDir: [0.3, 0.65, -0.7],
    fog: 0x0b1222,
    fogNear: 30,
    fogFar: 190,
    horizon: 0x24305a,
    zenith: 0x060a18,
    stars: 1,
    clouds: 0.15,
    moon: 1,
    sunGlow: 0x000000,
    waterDeep: 0x0a1426,
    waterShallow: 0x1d3550,
    waterSky: 0x34466c,
    choppiness: 1,
    glint: 1,
    exposure: 1.0,
    playerRim: 0.26,
  },
};

/** Light colour and strength per lamp kind (pelita flames, Kelip, the great Pelita Air's teal water-glass). */
const LAMP_LOOKS = {
  pelita: { color: 0xffa04a, intensity: 14 },
  kelip: { color: 0xd8f06a, intensity: 6 },
  pelita_air: { color: 0x5fe3d2, intensity: 30 },
};

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
    /** Current values (colours as Color, numbers as number). */
    this.current = {};
    this._from = null;
    this._to = null;
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
  }

  /**
   * Applies a preset immediately.
   * @param {keyof typeof LIGHT_PRESETS} name
   */
  set(name) {
    const preset = LIGHT_PRESETS[name];
    this._from = this._to = this._snapshot(preset);
    this._blend = 1;
    this.storm = name === 'storm';
    this._apply(this._to);
  }

  /**
   * Crossfades to a preset.
   * @param {keyof typeof LIGHT_PRESETS} name
   * @param {number} seconds
   */
  blendTo(name, seconds) {
    this._from = this._snapshot(this.current);
    this._to = this._snapshot(LIGHT_PRESETS[name]);
    this._blend = 0;
    this._blendTime = Math.max(0.01, seconds);
    this.storm = name === 'storm';
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
      const mixed = {};
      for (const key of COLOR_KEYS) mixed[key] = this._from[key].clone().lerp(this._to[key], t);
      for (const key of NUMBER_KEYS) mixed[key] = this._from[key] + (this._to[key] - this._from[key]) * t;
      mixed.keyDir = this._from.keyDir.clone().lerp(this._to.keyDir, t).normalize();
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
      const look = LAMP_LOOKS[lamp.kind] ?? LAMP_LOOKS.pelita;
      light.color.setHex(look.color);
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

  _snapshot(source) {
    const out = {};
    for (const key of COLOR_KEYS)
      out[key] = source[key] instanceof Color ? source[key].clone() : new Color(source[key]);
    for (const key of NUMBER_KEYS) out[key] = source[key];
    out.keyDir =
      source.keyDir instanceof Vector3 ? source.keyDir.clone() : new Vector3(...source.keyDir).normalize();
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
  }

  dispose() {
    this.scene.remove(this.hemi, this.key, this.key.target, ...this.pool);
    this.scene.fog = null;
  }
}
