/**
 * Deterministic pseudo-random numbers (mulberry32), for anything built from data that must look the same every load
 * (scattered rice, crowd placement). Gameplay randomness keeps its own seeded streams.
 * @param {number} seed
 * @returns {() => number} 0..1
 */
export function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
