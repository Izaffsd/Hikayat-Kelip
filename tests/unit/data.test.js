import { describe, expect, it } from 'vitest';
import { data, dataKeys } from '../../src/core/Data.js';
import { GAME_ACTIONS, UI_ACTIONS } from '../../src/core/Input.js';

describe('data files', () => {
  it('loads every bundled data file, deeply frozen', () => {
    const keys = dataKeys();
    for (const required of [
      'tuning/player',
      'tuning/camera',
      'input/bindings',
      'quality',
      'settings.defaults',
      'i18n/en',
      'i18n/bm',
      'ui/touchLayout',
    ]) {
      expect(keys).toContain(required);
    }
    const player = data('tuning/player');
    expect(Object.isFrozen(player)).toBe(true);
    expect(Object.isFrozen(player.jump)).toBe(true);
  });

  it('binds only known actions and known gamepad buttons', () => {
    const bindings = data('input/bindings');
    const buttons = new Set(Object.keys(bindings.gamepadButtons));
    for (const action of Object.keys(bindings.keyboard)) expect(GAME_ACTIONS).toContain(action);
    for (const [action, codes] of Object.entries(bindings.gamepad)) {
      expect(GAME_ACTIONS).toContain(action);
      for (const code of codes) expect(buttons.has(code), code).toBe(true);
    }
    for (const action of Object.keys(bindings.ui.keyboard)) expect(UI_ACTIONS).toContain(action);
    for (const codes of Object.values(bindings.ui.gamepad))
      for (const code of codes) expect(buttons.has(code)).toBe(true);
  });

  it('defines every quality preset with the same fields', () => {
    const { presets } = data('quality');
    const fields = Object.keys(presets.medium).sort();
    for (const name of ['low', 'medium', 'high']) expect(Object.keys(presets[name]).sort()).toEqual(fields);
    expect(presets.low.fireflies).toBeLessThanOrEqual(3000); // threejs stack guidance: mobile particle ceiling
  });

  it('spaces touch buttons ≥ 8 px apart and sizes them ≥ 48 px (design system §8)', () => {
    const { buttons } = data('ui/touchLayout');
    for (const b of buttons) expect(b.size, b.action).toBeGreaterThanOrEqual(48);
    const corner = buttons.filter((b) => b.anchor === 'bottom-right');
    for (let i = 0; i < corner.length; i++) {
      for (let j = i + 1; j < corner.length; j++) {
        const a = corner[i];
        const b = corner[j];
        const gap = Math.hypot(a.x - b.x, a.y - b.y) - (a.size + b.size) / 2;
        expect(gap, `${a.action}–${b.action}`).toBeGreaterThanOrEqual(8);
      }
    }
  });
});
