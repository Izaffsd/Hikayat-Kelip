import { EV } from './events.js';

/** Supported languages (internal codes). */
export const LANGUAGES = Object.freeze(['bm', 'en']);

/** BCP 47 tags for the document `lang` attribute. */
const HTML_LANG = { bm: 'ms', en: 'en' };

/**
 * Picks the starting language: an explicit setting wins; 'auto' follows the browser
 * (any Malay tag → BM, everything else → English).
 * @param {string} setting 'auto' | 'bm' | 'en'
 * @param {readonly string[]} browserLanguages navigator.languages
 * @returns {'bm'|'en'}
 */
export function resolveInitialLanguage(setting, browserLanguages) {
  if (setting === 'bm' || setting === 'en') return setting;
  for (const tag of browserLanguages) {
    const lower = tag.toLowerCase();
    if (lower === 'ms' || lower.startsWith('ms-') || lower === 'zsm') return 'bm';
    if (lower.startsWith('en')) return 'en';
  }
  return 'en';
}

/**
 * String tables for UI text. Missing keys fall back to English, then to the key itself (and are
 * reported once). DOM elements opt in with `data-i18n` (text) and `data-i18n-label` (aria-label).
 */
export class I18n {
  /**
   * @param {object} options
   * @param {Record<string, Record<string, string>>} options.tables e.g. { bm: {...}, en: {...} }
   * @param {'bm'|'en'} [options.language='en']
   * @param {import('./EventBus.js').EventBus} [options.bus]
   */
  constructor({ tables, language = 'en', bus }) {
    this.tables = tables;
    this.bus = bus;
    this._language = tables[language] ? language : 'en';
    /** @type {Set<string>} */
    this._reported = new Set();
  }

  /** Current language code. */
  get language() {
    return this._language;
  }

  /**
   * Switches language and notifies listeners.
   * @param {'bm'|'en'} language
   */
  setLanguage(language) {
    if (!this.tables[language]) throw new Error(`Unsupported language: ${language}`);
    if (language === this._language) return;
    this._language = language;
    if (typeof document !== 'undefined') document.documentElement.lang = HTML_LANG[language] ?? language;
    this.bus?.emit(EV.LANGUAGE_CHANGED, { language });
  }

  /**
   * Translates a key, replacing `{name}` placeholders with `params`.
   * @param {string} key
   * @param {Record<string, string|number>} [params]
   * @returns {string}
   */
  t(key, params) {
    let text = this.tables[this._language]?.[key] ?? this.tables.en?.[key];
    if (text === undefined) {
      if (!this._reported.has(key)) {
        this._reported.add(key);
        console.warn(`[I18n] missing string: ${key}`);
      }
      return key;
    }
    if (params)
      text = text.replace(/\{(\w+)\}/g, (match, name) => (name in params ? String(params[name]) : match));
    return text;
  }

  /**
   * Updates every opted-in element under `root`.
   * @param {ParentNode} root
   */
  applyTo(root) {
    for (const element of root.querySelectorAll('[data-i18n]')) {
      element.textContent = this.t(/** @type {HTMLElement} */ (element).dataset.i18n);
    }
    for (const element of root.querySelectorAll('[data-i18n-label]')) {
      element.setAttribute('aria-label', this.t(/** @type {HTMLElement} */ (element).dataset.i18nLabel));
    }
  }
}
