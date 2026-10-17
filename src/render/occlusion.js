import { Vector3 } from 'three/webgpu';
import {
  cameraPosition,
  dot,
  float,
  interleavedGradientNoise,
  length,
  mix,
  positionWorld,
  screenCoordinate,
  smoothstep,
  uniform,
} from 'three/tsl';
import { toNodeMaterial } from './inkMaterial.js';

/**
 * The player the camera looks at (chest height), updated every frame by the engine. Kit geometry that sits between
 * the camera and this point is dithered away, so a roof or a wall never hides Bayu (the pondok on the long jetty,
 * the houses of the rooftop chase).
 */
export const SEE_THROUGH_TARGET = uniform(new Vector3(0, -1e4, 0));

/** Radius of the see-through window near the player and near the camera (metres). */
const RADIUS_NEAR_PLAYER = 1.15;
const RADIUS_NEAR_CAMERA = 0.35;

const cache = new WeakMap();

/**
 * The kit material with a see-through mask: fragments inside a cone from the camera to the player (excluding the
 * last stretch around the player, so the floor under his feet stays) are discarded in a stable screen-space dither.
 * One material per source material (cached), shared by every instance.
 * @param {import('three').Material} source
 * @returns {import('three').Material}
 */
export function seeThrough(source) {
  let material = cache.get(source);
  if (material) return material;
  material = toNodeMaterial(source);
  const toTarget = SEE_THROUGH_TARGET.sub(cameraPosition);
  const span = dot(toTarget, toTarget).max(1e-4);
  const t = dot(positionWorld.sub(cameraPosition), toTarget).div(span);
  const closest = cameraPosition.add(toTarget.mul(t.clamp(0, 1)));
  const distance = length(positionWorld.sub(closest));
  const radius = mix(float(RADIUS_NEAR_CAMERA), float(RADIUS_NEAR_PLAYER), t.clamp(0, 1));
  // 1 inside the cone between camera and player, fading at its edge and just before the player.
  const inside = float(1)
    .sub(smoothstep(radius.mul(0.7), radius, distance))
    .mul(smoothstep(0.02, 0.08, t))
    .mul(float(1).sub(smoothstep(0.86, 0.93, t)));
  const noise = interleavedGradientNoise(screenCoordinate.xy);
  material.maskNode = noise.greaterThan(inside.mul(0.92));
  cache.set(source, material);
  return material;
}
