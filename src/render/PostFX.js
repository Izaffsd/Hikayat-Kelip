import { RenderPipeline } from 'three/webgpu';
import { pass, renderOutput } from 'three/tsl';
import { bloom } from 'three/addons/tsl/display/BloomNode.js';
import { fxaa } from 'three/addons/tsl/display/FXAANode.js';
import { smaa } from 'three/addons/tsl/display/SMAANode.js';
import { gradeNode } from './grade.js';

/**
 * Builds the post-processing chain for a quality preset (TECHNICAL §3.3) using `RenderPipeline`
 * (three r183+; never the deprecated `PostProcessing`): bloom, the region's colour grade (render/grade.js, driven by
 * the lighting mood), anti-aliasing. Low quality renders directly with no chain (its moods carry the look).
 */
export class PostFX {
  /**
   * @param {import('./Renderer.js').Renderer} renderer
   */
  constructor(renderer) {
    this.renderer = renderer;
    /** @type {RenderPipeline|null} */
    this.pipeline = null;
    /** @type {any} */
    this.bloomNode = null;
  }

  /**
   * (Re)builds the chain for a scene/camera and preset.
   * @param {import('three').Scene} scene
   * @param {import('three').Camera} camera
   * @param {object} preset quality preset from data/quality.json
   */
  build(scene, camera, preset) {
    this.dispose();
    const post = preset.post;
    if (!post.enabled) {
      this.renderer.pipeline = null;
      return;
    }
    const pipeline = new RenderPipeline(this.renderer.three);
    const scenePass = pass(scene, camera);
    let color = scenePass.getTextureNode('output');
    if (post.bloom) {
      this.bloomNode = bloom(color, 0.6, 0.35, 0.82);
      color = color.add(this.bloomNode);
    }
    color = gradeNode(color);
    if (post.smaa || post.fxaa) {
      // Anti-aliasing expects display-referred (tone-mapped, sRGB) input.
      pipeline.outputColorTransform = false;
      const display = renderOutput(color);
      pipeline.outputNode = post.smaa ? smaa(display) : fxaa(display);
    } else {
      pipeline.outputNode = color;
    }
    this.pipeline = pipeline;
    this.renderer.pipeline = pipeline;
  }

  /** Releases the current chain. */
  dispose() {
    if (this.pipeline) {
      this.pipeline.dispose();
      this.pipeline = null;
      this.renderer.pipeline = null;
    }
    this.bloomNode = null;
  }
}
