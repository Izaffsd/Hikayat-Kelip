import { MeshStandardNodeMaterial } from 'three/webgpu';
import {
  abs,
  attribute,
  cameraPosition,
  dot,
  float,
  materialColor,
  max,
  mix,
  mx_fractal_noise_float,
  normalWorld,
  normalize,
  positionGeometry,
  positionLocal,
  positionWorld,
  pow,
  sin,
  smoothstep,
  time,
  uniform,
  vec3,
  vec4,
  cos,
} from 'three/tsl';

const COPIED = [
  'color',
  'map',
  'roughness',
  'metalness',
  'roughnessMap',
  'metalnessMap',
  'normalMap',
  'normalScale',
  'aoMap',
  'aoMapIntensity',
  'emissive',
  'emissiveMap',
  'emissiveIntensity',
  'transparent',
  'opacity',
  'alphaTest',
  'side',
  'vertexColors',
  'name',
];

/**
 * A node-material copy of a glTF material (keeps maps by reference), so TSL nodes can be added per instance.
 * @param {import('three').Material} source
 * @returns {MeshStandardNodeMaterial}
 */
export function toNodeMaterial(source) {
  const material = new MeshStandardNodeMaterial();
  for (const key of COPIED) {
    const value = source[key];
    if (value === undefined) continue;
    material[key] = value && typeof value.clone === 'function' && !value.isTexture ? value.clone() : value;
  }
  return material;
}

/**
 * Kelam's ink on a cursed villager (CULTURE.md: ink-like, colour-draining, no gore): colours drain toward a dark
 * grey, dark veins flow through the body (noise in the bind-pose space, so they stay on the body), and a cold
 * violet rim glows at the silhouette. `ink` (0..1) fades it all away when the villager is freed; `tell` (0..1)
 * flashes the rim amber while an attack winds up (TECHNICAL §6.2: every tell has a colour cue).
 * @param {import('three').Material} source
 * @param {{ value: number }} ink uniform shared by one character's materials
 * @param {{ value: number }} tell uniform shared by one character's materials
 * @returns {MeshStandardNodeMaterial}
 */
export function inkMaterial(source, ink, tell) {
  const material = toNodeMaterial(source);
  const amount = /** @type {any} */ (ink);
  const warn = /** @type {any} */ (tell);
  const base = materialColor;
  const luma = dot(base.rgb, vec3(0.299, 0.587, 0.114));
  const drained = mix(base.rgb, vec3(luma).mul(0.22), amount.mul(0.9));
  const flow = mx_fractal_noise_float(positionGeometry.mul(3.2).add(vec3(0, time.mul(0.45), 0)));
  const veins = float(1)
    .sub(smoothstep(0.015, 0.08, abs(flow)))
    .mul(amount);
  material.colorNode = vec4(mix(drained, vec3(0.025, 0.018, 0.05), veins.mul(0.92)), base.a);
  const view = normalize(cameraPosition.sub(positionWorld));
  const rim = pow(float(1).sub(max(dot(normalWorld, view), 0)), 3);
  const pulse = sin(time.mul(2.4)).mul(0.25).add(0.75);
  const violet = vec3(0.3, 0.1, 0.52).mul(rim.mul(amount).mul(0.42).add(veins.mul(pulse).mul(0.12)));
  const amber = vec3(1.0, 0.55, 0.12).mul(warn.mul(rim.mul(2.2).add(0.12)));
  material.emissiveNode = violet.add(amber);
  return material;
}

/** A uniform for `inkMaterial` (one per character). */
export function inkUniform(value = 1) {
  return uniform(value);
}

/**
 * The shadow wisp's material: its tendrils sway (vertex weight `_sway` from the Blender build) and the whole body
 * fades with `fade` (1 = solid, 0 = gone) when it dissolves into fireflies.
 * @param {import('three').Material} source
 * @param {{ value: number }} fade
 * @param {string} swayAttribute geometry attribute name holding the sway weight
 * @returns {MeshStandardNodeMaterial}
 */
export function wispMaterial(source, fade, swayAttribute) {
  const material = toNodeMaterial(source);
  const sway = attribute(swayAttribute, 'float');
  const p = positionLocal;
  const offset = vec3(
    sin(time.mul(3.1).add(p.y.mul(7))).mul(0.07),
    cos(time.mul(2.3).add(p.x.mul(6))).mul(0.05),
    sin(time.mul(2.7).add(p.z.mul(5))).mul(0.04),
  );
  material.positionNode = p.add(offset.mul(sway));
  material.transparent = true;
  material.opacityNode = /** @type {any} */ (fade);
  return material;
}
