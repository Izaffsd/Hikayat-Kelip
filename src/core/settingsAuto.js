/**
 * How 'auto' settings resolve per device (GDD "Touch assists (on by default, each switchable)").
 * @type {Record<string, (platform: import('./Platform.js').PlatformInfo) => unknown>}
 */
export const AUTO_RESOLVERS = Object.freeze({
  'graphics.fpsCap30': (p) => p.isTouch,
  'camera.autoCamera': (p) => p.isTouch,
  'accessibility.reducedMotion': (p) => p.prefersReducedMotion,
  'assists.widerParry': (p) => p.isTouch,
  'assists.ledgeMagnet': (p) => (p.isTouch ? 'strong' : 'normal'),
  'assists.autoLockOn': (p) => p.isTouch,
});
