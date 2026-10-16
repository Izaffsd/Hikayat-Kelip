/**
 * Original outline icons for the touch controls (24 px grid, 2 px stroke, round caps — design system §6).
 * Each entry is the inner SVG markup.
 */
export const TOUCH_ICONS = Object.freeze({
  jump: '<path d="M6 15l6-6 6 6"/><path d="M6 20h12"/>',
  strike: '<path d="M5 19L19 5"/><path d="M15.5 5H19v3.5"/><path d="M4 16l4 4"/>',
  langkah:
    '<path d="M8.5 4.5c1.6 0 2.5 1.5 2.5 3.5s-.9 4-2.5 4S6 10 6 8s.9-3.5 2.5-3.5z"/><path d="M15.5 11c1.6 0 2.5 1.5 2.5 3.5s-.9 4-2.5 4-2.5-2-2.5-4 .9-3.5 2.5-3.5z"/>',
  tangkis: '<path d="M5 18c2-7 7-11 14-12"/><path d="M5 12c1.5-2.5 3.5-4.2 6-5"/>',
  context: '<circle cx="12" cy="12" r="3"/><path d="M12 3v3M12 18v3M3 12h3M18 12h3"/>',
  kelip:
    '<circle cx="12" cy="12" r="2.5"/><path d="M12 4.5v2M12 17.5v2M4.5 12h2M17.5 12h2M6.7 6.7l1.4 1.4M15.9 15.9l1.4 1.4M6.7 17.3l1.4-1.4M15.9 8.1l1.4-1.4"/>',
  pause: '<path d="M9 6v12M15 6v12"/>',
});

/**
 * Builds an inline SVG element string for an icon.
 * @param {keyof typeof TOUCH_ICONS} name
 * @returns {string}
 */
export function iconSvg(name) {
  return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${TOUCH_ICONS[name]}</svg>`;
}
