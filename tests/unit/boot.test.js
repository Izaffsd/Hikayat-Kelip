import { describe, expect, it } from 'vitest';
import { data } from '../../src/core/Data.js';
import { SAVE_KEY } from '../../src/core/SaveManager.js';

const BOOT = data('boot');
const MANIFEST = data('generated/assets').assets;

describe('early downloads (data/boot.json)', () => {
  it('names built assets and both player models', () => {
    for (const key of BOOT.assets) expect(MANIFEST[key], key).toBeDefined();
    for (const avatar of [BOOT.avatar, BOOT.prologueAvatar])
      expect(MANIFEST[`characters/${avatar}`], avatar).toBeDefined();
  });

  it('reads the same save key as the SaveManager', () => {
    expect(BOOT.saveKey).toBe(SAVE_KEY);
  });

  it('the kits it fetches are the ones both slice regions use', async () => {
    const { loadData } = await import('../../src/core/Data.js');
    for (const region of ['prologue', 'kampung']) {
      const { kits } = await loadData(`regions/${region}`);
      for (const kit of kits) expect(BOOT.assets, `${region}: ${kit}`).toContain(kit);
    }
  });
});
