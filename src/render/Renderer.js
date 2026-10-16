import { ACESFilmicToneMapping, SRGBColorSpace, WebGPURenderer } from 'three/webgpu';
import { EV } from '../core/events.js';

/**
 * Checks whether a WebGPU adapter is actually obtainable. Probing ourselves (instead of letting the
 * renderer fall back) avoids three's fallback warning, keeping the console clean.
 * @param {Navigator} [nav]
 * @returns {Promise<boolean>}
 */
export async function webgpuAvailable(nav = navigator) {
  const gpu = /** @type {any} */ (nav).gpu;
  if (!gpu) return false;
  try {
    return (await gpu.requestAdapter()) !== null;
  } catch {
    return false;
  }
}

/**
 * The single renderer for the page's lifetime (WebGPU with a WebGL2 backend fallback).
 * Owns sizing (CSS size × min(DPR, max) × render scale) and per-frame stats reset.
 */
export class Renderer {
  /**
   * Creates and initialises the renderer.
   * @param {object} options
   * @param {HTMLCanvasElement} options.canvas
   * @param {boolean} options.forceWebGL debug toggle / `?webgl=1`
   * @param {import('../core/EventBus.js').EventBus} options.bus
   * @returns {Promise<Renderer>}
   */
  static async create({ canvas, forceWebGL, bus }) {
    const useWebGL = forceWebGL || !(await webgpuAvailable());
    const three = new WebGPURenderer({
      canvas,
      antialias: false,
      forceWebGL: useWebGL,
      // Only the WebGL path honours this; Chrome warns that WebGPU ignores it on Windows.
      ...(useWebGL ? { powerPreference: 'high-performance' } : {}),
    });
    await three.init();
    return new Renderer(three, bus);
  }

  /**
   * @param {WebGPURenderer} three initialised renderer
   * @param {import('../core/EventBus.js').EventBus} bus
   */
  constructor(three, bus) {
    this.three = three;
    this.bus = bus;
    /** @type {'webgpu'|'webgl2'} */
    this.backend = three.backend.isWebGPUBackend ? 'webgpu' : 'webgl2';
    three.info.autoReset = false;
    three.outputColorSpace = SRGBColorSpace;
    three.toneMapping = ACESFilmicToneMapping;
    three.toneMappingExposure = 1;
    this.renderScale = 1;
    this.maxPixelRatio = 2;
    this.width = 1;
    this.height = 1;
    this.pixelRatio = 1;
    /** @type {import('three/webgpu').RenderPipeline|null} */
    this.pipeline = null;
  }

  /**
   * Sets the CSS size of the drawing area.
   * @param {number} width
   * @param {number} height
   */
  resize(width, height) {
    this.width = Math.max(1, Math.floor(width));
    this.height = Math.max(1, Math.floor(height));
    this._apply();
  }

  /**
   * Scales the internal resolution (dynamic resolution, battery saver).
   * @param {number} scale 0.5..1
   */
  setRenderScale(scale) {
    if (Math.abs(scale - this.renderScale) < 1e-3) return;
    this.renderScale = scale;
    this._apply();
  }

  /**
   * Caps the device pixel ratio used for rendering.
   * @param {number} value
   */
  setMaxPixelRatio(value) {
    this.maxPixelRatio = value;
    this._apply();
  }

  /**
   * Renders one frame: through the post pipeline when one is set, otherwise directly.
   * @param {import('three').Scene} scene
   * @param {import('three').Camera} camera
   */
  render(scene, camera) {
    this.three.info.reset();
    if (this.pipeline) this.pipeline.render();
    else this.three.render(scene, camera);
  }

  /**
   * Starts/stops the animation loop driver (`setAnimationLoop`), bound for Loop.start().
   * @returns {(callback: ((time: number) => void) | null) => void}
   */
  get animationLoopDriver() {
    return (callback) => this.three.setAnimationLoop(callback);
  }

  _apply() {
    const dpr = typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1;
    this.pixelRatio = Math.min(dpr, this.maxPixelRatio) * this.renderScale;
    this.three.setPixelRatio(this.pixelRatio);
    this.three.setSize(this.width, this.height, false);
    this.bus.emit(EV.RESIZE, { width: this.width, height: this.height, pixelRatio: this.pixelRatio });
  }
}
