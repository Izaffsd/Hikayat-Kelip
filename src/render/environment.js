import { Color } from 'three/webgpu';
import { uniform } from 'three/tsl';

/**
 * Environment values the lighting mood sets once (DayNight) and any material can read: the colour the sky gives
 * standing water (paddies, puddles), so they shimmer with the region's light without each owning the lighting.
 */
export const ENV = Object.freeze({
  /** Sky colour reflected by still water (data/lighting.json `waterSky`). */
  waterSky: uniform(new Color(0.2, 0.25, 0.35)),
});
