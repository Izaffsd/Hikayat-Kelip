import { EV } from '../core/events.js';

/**
 * Chooses and applies quality presets (data/quality.json) and runs dynamic resolution.
 *
 * Dynamic resolution watches two signals over a short window: slow frames (missed vsyncs, measured
 * as frame interval above budget) and CPU work time. It steps the render scale down when frames are
 * slow and back up after a sustained calm period — this also absorbs thermal throttling on phones.
 */
export class QualityManager {
  /**
   * @param {object} options
   * @param {import('./Renderer.js').Renderer} options.renderer
   * @param {import('../core/Settings.js').Settings} options.settings
   * @param {import('../core/EventBus.js').EventBus} options.bus
   * @param {object} options.config data/quality.json
   * @param {import('../core/Platform.js').PlatformInfo} options.platform
   */
  constructor({ renderer, settings, bus, config, platform }) {
    this.renderer = renderer;
    this.settings = settings;
    this.bus = bus;
    this.config = config;
    this.platform = platform;
    /** @type {'low'|'medium'|'high'} */
    this.presetName = 'medium';
    this.preset = config.presets.medium;
    this.fpsCap = 0;
    this.maxRenderScale = 1;
    this._windowTime = 0;
    this._windowFrames = 0;
    this._slowFrames = 0;
    this._workTime = 0;
    this._calmTime = 0;
  }

  /**
   * Picks the preset: explicit setting, battery saver, or automatic by device and backend.
   * @returns {'low'|'medium'|'high'}
   */
  choosePreset() {
    if (this.settings.get('graphics.batterySaver')) return this.config.batterySaver.preset;
    const chosen = this.settings.get('graphics.preset');
    if (chosen === 'low' || chosen === 'medium' || chosen === 'high') return chosen;
    if (this.platform.isTouch) return 'low';
    return this.renderer.backend === 'webgpu' ? 'high' : 'medium';
  }

  /**
   * Applies a preset (or the chosen one) to the renderer and the frame-rate cap.
   * @param {'low'|'medium'|'high'} [name]
   */
  apply(name = this.choosePreset()) {
    this.presetName = name;
    this.preset = this.config.presets[name];
    const battery = this.settings.get('graphics.batterySaver');
    const capSetting = this.settings.get('graphics.fpsCap30');
    const cap30 = capSetting === 'auto' ? this.platform.isTouch : capSetting === true;
    this.fpsCap = battery ? this.config.batterySaver.fpsCap : cap30 ? 30 : 0;
    this.maxRenderScale = battery
      ? Math.min(this.preset.renderScale, this.config.batterySaver.maxRenderScale)
      : this.preset.renderScale;
    this.renderer.maxPixelRatio = this.preset.maxPixelRatio;
    this.renderer.setRenderScale(this.maxRenderScale);
    this.renderer.setMaxPixelRatio(this.preset.maxPixelRatio);
    this._resetWindow();
    this._calmTime = 0;
    this.bus.emit(EV.QUALITY_CHANGED, {
      preset: name,
      renderScale: this.renderer.renderScale,
      fpsCap: this.fpsCap,
    });
  }

  /** Frame budget in seconds for the current target. */
  get budget() {
    const target = this.fpsCap > 0 ? this.fpsCap : this.preset.targetFps;
    return 1 / target;
  }

  /**
   * Feeds one rendered frame into dynamic resolution.
   * @param {number} frameInterval real seconds since the previous rendered frame
   * @param {number} workTime seconds of CPU work spent in this frame
   */
  update(frameInterval, workTime) {
    if (!this.settings.get('graphics.dynamicResolution')) return;
    const dyn = this.config.dynamicResolution;
    const budget = this.budget;
    this._windowTime += frameInterval;
    this._windowFrames++;
    this._workTime += workTime;
    if (frameInterval > budget * 1.25) this._slowFrames++;
    if (this._windowFrames < dyn.sampleFrames) return;

    const slowShare = this._slowFrames / this._windowFrames;
    const workShare = this._workTime / this._windowFrames / budget;
    const windowSeconds = this._windowTime;
    this._resetWindow();

    const scale = this.renderer.renderScale;
    if (slowShare > 0.1) {
      this._calmTime = 0;
      const next = Math.max(this.preset.minRenderScale, scale - dyn.stepDown);
      if (next < scale) this._setScale(next);
    } else if (slowShare === 0 && workShare < dyn.upHeadroom) {
      this._calmTime += windowSeconds;
      if (this._calmTime >= dyn.upHoldSeconds && scale < this.maxRenderScale) {
        this._calmTime = 0;
        this._setScale(Math.min(this.maxRenderScale, scale + dyn.stepUp));
      }
    } else {
      this._calmTime = 0;
    }
  }

  /**
   * @param {number} scale
   */
  _setScale(scale) {
    this.renderer.setRenderScale(Math.round(scale * 100) / 100);
    this.bus.emit(EV.QUALITY_CHANGED, {
      preset: this.presetName,
      renderScale: this.renderer.renderScale,
      fpsCap: this.fpsCap,
    });
  }

  _resetWindow() {
    this._windowTime = 0;
    this._windowFrames = 0;
    this._slowFrames = 0;
    this._workTime = 0;
  }
}
