import { test as base, chromium } from '@playwright/test';

export { expect } from '@playwright/test';

/** The test Chrome left open by `npm run chrome:test` (tools/test-chrome.mjs). */
const ENDPOINT = `http://127.0.0.1:${process.env.HK_CHROME_PORT ?? 9333}`;

/**
 * Visual-test fixtures (D-035). When the test Chrome is running, every test is a new tab in that one window:
 * nothing is launched or closed between tests or runs, and the tab's site storage is cleared first so each test
 * starts from a new save. Without it, Playwright launches Chrome as before (a window per test).
 * `testQuery` comes from the project (playwright.config.js): '' for WebGPU, 'webgl=1' for forced WebGL2.
 */
export const test = base.extend({
  testQuery: ['', { option: true }],

  hkBrowser: [
    async ({ channel, headless, launchOptions }, use) => {
      let browser;
      let shared = true;
      try {
        browser = await chromium.connectOverCDP(ENDPOINT, { timeout: 3000 });
      } catch {
        shared = false;
        browser = await chromium.launch({ channel, headless, ...launchOptions });
      }
      await use({ browser, shared });
      // Connected: only disconnects (the window stays open). Launched: closes it.
      await browser.close();
    },
    { scope: 'worker' },
  ],

  page: async ({ hkBrowser, baseURL, viewport }, use) => {
    const { browser, shared } = hkBrowser;
    const context = shared ? browser.contexts()[0] : await browser.newContext({ baseURL, viewport });
    const page = await context.newPage();
    if (shared) {
      await page.setViewportSize(viewport);
      const cdp = await context.newCDPSession(page);
      await cdp.send('Storage.clearDataForOrigin', { origin: new URL(baseURL).origin, storageTypes: 'all' });
      await cdp.detach();
      // The shared window's context has no baseURL: resolve the tests' relative URLs here.
      const goto = page.goto.bind(page);
      page.goto = (url, options) => goto(new URL(url, baseURL).href, options);
    }
    await use(page);
    await page.close();
    if (!shared) await context.close();
  },
});
