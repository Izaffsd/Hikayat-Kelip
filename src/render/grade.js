import { Color } from 'three/webgpu';
import { float, luminance, mix, uniform, vec3, vec4 } from 'three/tsl';

/**
 * The colour grade (BUILD_PROMPT Phase 4: rendering per region): one set of uniforms the lighting mood drives
 * (DayNight, from data/lighting.json) and the post chain applies to the scene colour before tone mapping. Neutral
 * values change nothing.
 */
export const GRADE = Object.freeze({
  /** Multiplies the colour (white = none). */
  gain: uniform(new Color(1, 1, 1)),
  /** Added to the shadows, fading out toward the highlights (black = none). */
  lift: uniform(new Color(0, 0, 0)),
  /** 1 = unchanged, 0 = grey. */
  saturation: uniform(1),
  /** Around mid grey (0.18 linear); 1 = unchanged. */
  contrast: uniform(1),
});

const MID_GREY = 0.18;

/**
 * Grades a linear scene colour node.
 * @param {any} color vec3 or vec4 node (linear, before tone mapping)
 * @returns {any} vec4 node (opaque)
 */
export function gradeNode(color) {
  const rgb = vec3(color.rgb ?? color);
  const gained = rgb.mul(GRADE.gain);
  // Lift weighs the darks: full at black, gone by mid grey and above.
  const weight = float(1).sub(luminance(gained).div(MID_GREY)).clamp(0, 1);
  const lifted = gained.add(vec3(GRADE.lift).mul(weight));
  const grey = luminance(lifted);
  const saturated = mix(vec3(grey), lifted, GRADE.saturation);
  return vec4(saturated.max(0).div(MID_GREY).pow(GRADE.contrast).mul(MID_GREY), 1);
}
