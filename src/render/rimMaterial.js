import {
  dot,
  float,
  max,
  normalize,
  normalWorld,
  cameraPosition,
  positionWorld,
  pow,
  uniform,
  vec3,
} from 'three/tsl';
import { toNodeMaterial } from './inkMaterial.js';

/**
 * Strength of the player's rim light (0 = none). DayNight sets it from the lighting preset (strong in the storm and
 * at night, faint at dusk), so it blends with the time of day.
 */
export const PLAYER_RIM = uniform(0);

/**
 * The player character's material: the glTF material plus a cool moonlight rim at the silhouette, so Bayu (or young
 * Wan in dark clothes) stays readable against dark roofs and water at night (TECHNICAL §3.2: readability first).
 * @param {import('three').Material} source
 * @returns {import('three/webgpu').MeshStandardNodeMaterial}
 */
export function rimMaterial(source) {
  const material = toNodeMaterial(source);
  const view = normalize(cameraPosition.sub(positionWorld));
  const rim = pow(float(1).sub(max(dot(normalWorld, view), 0)), 4);
  material.emissiveNode = vec3(0.55, 0.7, 1.0).mul(rim).mul(PLAYER_RIM);
  return material;
}
