/**
 * Device and browser capabilities, detected once at boot. Functions take the globals they need as
 * parameters (defaulting to the browser's) so they can be unit-tested in Node.
 */

/**
 * @typedef {object} PlatformInfo
 * @property {boolean} isTouch primary pointer is coarse or touch points exist
 * @property {boolean} isIOS
 * @property {boolean} isAndroid
 * @property {boolean} isStandalone launched from the Home Screen / installed
 * @property {boolean} prefersReducedMotion
 * @property {boolean} hasWebGPU navigator.gpu exists (the adapter may still fail)
 * @property {number} devicePixelRatio
 * @property {string[]} languages
 * @property {URLSearchParams} query
 */

/**
 * Detects the platform.
 * @param {Window} [win=window]
 * @returns {PlatformInfo}
 */
export function detectPlatform(win = window) {
  const nav = win.navigator;
  const ua = nav.userAgent || '';
  const coarse = win.matchMedia?.('(pointer: coarse)').matches ?? false;
  const touchPoints = nav.maxTouchPoints || 0;
  const isIPadOS = nav.platform === 'MacIntel' && touchPoints > 1;
  return {
    isTouch: coarse || touchPoints > 0,
    isIOS: /iP(hone|ad|od)/.test(ua) || isIPadOS,
    isAndroid: /Android/i.test(ua),
    isStandalone:
      (win.matchMedia?.('(display-mode: standalone)').matches ?? false) ||
      /** @type {any} */ (nav).standalone === true,
    prefersReducedMotion: win.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false,
    hasWebGPU: 'gpu' in nav,
    devicePixelRatio: win.devicePixelRatio || 1,
    languages: nav.languages?.length ? [...nav.languages] : [nav.language || 'en'],
    query: new URLSearchParams(win.location?.search || ''),
  };
}

/**
 * Lets Web Audio play while the iPhone's silent switch is on (iOS 17+ Safari). No-op elsewhere.
 * @param {Navigator} [nav=navigator]
 * @returns {boolean} true when the session type was set
 */
export function setupAudioSession(nav = navigator) {
  try {
    const session = /** @type {any} */ (nav).audioSession;
    if (session && 'type' in session) {
      session.type = 'playback';
      return true;
    }
  } catch {
    // Older browsers throw on unknown values; audio still works with the switch off.
  }
  return false;
}

/**
 * Whether the viewport is in portrait on a touch device (the game then shows the rotate screen).
 * @param {Window} [win=window]
 * @returns {boolean}
 */
export function isPortrait(win = window) {
  return win.matchMedia?.('(orientation: portrait)').matches ?? win.innerHeight > win.innerWidth;
}
