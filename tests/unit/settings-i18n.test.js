import { describe, expect, it, vi } from 'vitest';
import { data } from '../../src/core/Data.js';
import { EventBus } from '../../src/core/EventBus.js';
import { EV } from '../../src/core/events.js';
import { I18n, LANGUAGES, resolveInitialLanguage } from '../../src/core/I18n.js';
import { Settings } from '../../src/core/Settings.js';
import { AUTO_RESOLVERS } from '../../src/core/settingsAuto.js';
import { createMemoryStorage } from '../../src/core/storage.js';

function makeSettings(
  storage = createMemoryStorage(),
  platform = { isTouch: true, prefersReducedMotion: false },
) {
  const bus = new EventBus();
  const settings = new Settings({
    storage,
    bus,
    defaults: data('settings.defaults'),
    autoResolvers: AUTO_RESOLVERS,
    platform,
  });
  settings.load();
  return { settings, bus, storage };
}

describe('Settings', () => {
  it('reads defaults and resolves auto values per device', () => {
    const { settings } = makeSettings();
    expect(settings.get('graphics.fpsCap30')).toBe('auto');
    expect(settings.resolve('graphics.fpsCap30')).toBe(true);
    const desktop = makeSettings(createMemoryStorage(), { isTouch: false, prefersReducedMotion: true });
    expect(desktop.settings.resolve('graphics.fpsCap30')).toBe(false);
    expect(desktop.settings.resolve('accessibility.reducedMotion')).toBe(true);
  });

  it('sets values (including over an auto default), emits and persists them', () => {
    const { settings, bus, storage } = makeSettings();
    const changes = [];
    bus.on(EV.SETTINGS_CHANGED, (c) => changes.push(c));
    settings.set('graphics.fpsCap30', false);
    settings.set('audio.music', 0.25);
    settings.persist();
    expect(changes).toEqual([
      { path: 'graphics.fpsCap30', value: false },
      { path: 'audio.music', value: 0.25 },
    ]);
    const reloaded = makeSettings(storage);
    expect(reloaded.settings.get('graphics.fpsCap30')).toBe(false);
    expect(reloaded.settings.get('audio.music')).toBe(0.25);
  });

  it('rejects wrong types and ignores mistyped stored values', () => {
    const { settings, storage } = makeSettings();
    expect(() => settings.set('audio.music', 'loud')).toThrow(TypeError);
    storage.set(
      'hk.settings',
      JSON.stringify({ version: 1, values: { audio: { music: 'loud' }, subtitles: false } }),
    );
    const reloaded = makeSettings(storage);
    expect(reloaded.settings.get('audio.music')).toBe(0.8);
    expect(reloaded.settings.get('subtitles')).toBe(false);
  });

  it('survives corrupt stored settings', () => {
    const storage = createMemoryStorage();
    storage.set('hk.settings', '{broken');
    const { settings } = makeSettings(storage);
    expect(settings.get('language')).toBe('auto');
  });
});

describe('I18n', () => {
  const tables = { bm: data('i18n/bm'), en: data('i18n/en') };

  it('has the same keys in Bahasa Melayu and English, none empty', () => {
    const bm = Object.keys(tables.bm).sort();
    const en = Object.keys(tables.en).sort();
    expect(bm).toEqual(en);
    for (const language of LANGUAGES) {
      for (const [key, text] of Object.entries(tables[language])) {
        expect(text.trim().length, `${language}:${key}`).toBeGreaterThan(0);
      }
    }
  });

  it('keeps the same placeholders in both languages', () => {
    for (const key of Object.keys(tables.en)) {
      const placeholders = (text) => (text.match(/\{\w+\}/g) ?? []).sort();
      expect(placeholders(tables.bm[key]), key).toEqual(placeholders(tables.en[key]));
    }
  });

  it('follows the browser language when set to auto', () => {
    expect(resolveInitialLanguage('auto', ['ms-MY', 'en-US'])).toBe('bm');
    expect(resolveInitialLanguage('auto', ['ms'])).toBe('bm');
    expect(resolveInitialLanguage('auto', ['en-GB', 'ms'])).toBe('en');
    expect(resolveInitialLanguage('auto', ['fr-FR'])).toBe('en');
    expect(resolveInitialLanguage('bm', ['en-US'])).toBe('bm');
  });

  it('translates with placeholders and falls back to English, then the key', () => {
    const i18n = new I18n({
      tables: { bm: { only: 'Hai {name}' }, en: { only: 'Hi {name}', enOnly: 'English' } },
      language: 'bm',
    });
    expect(i18n.t('only', { name: 'Bayu' })).toBe('Hai Bayu');
    expect(i18n.t('enOnly')).toBe('English');
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    expect(i18n.t('missing.key')).toBe('missing.key');
    expect(i18n.t('missing.key')).toBe('missing.key');
    expect(warn).toHaveBeenCalledTimes(1); // reported once, not every frame
    warn.mockRestore();
  });
});
