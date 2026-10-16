/**
 * Shared helpers for the performance specs.
 */

/**
 * Opens the game in test mode on the given backend, waits for boot and starts it.
 * @param {import('@playwright/test').Page} page
 * @param {string} testQuery '' or 'webgl=1'
 * @param {string} [extra] more query parameters
 */
export async function openAndStart(page, testQuery, extra = '') {
  const query = ['test=1', testQuery, extra].filter(Boolean).join('&');
  await page.goto(`/?${query}`);
  await page.waitForFunction(() => window.__hk?.ready === true, null, { timeout: 90_000 });
  await page.mouse.click(640, 520);
  await page.waitForFunction(() => window.__hk.started && window.__hk.frame > 30, null, { timeout: 30_000 });
}

/**
 * Measures frame intervals in the page for `seconds` and returns average FPS and the 5th-percentile FPS.
 * @param {import('@playwright/test').Page} page
 * @param {number} seconds
 * @returns {Promise<{ fpsAvg: number, fpsP5: number, frames: number }>}
 */
export function measureFps(page, seconds) {
  return page.evaluate(
    (duration) =>
      new Promise((resolve) => {
        const intervals = [];
        let last = performance.now();
        const end = last + duration * 1000;
        const tick = (now) => {
          intervals.push(now - last);
          last = now;
          if (now < end) requestAnimationFrame(tick);
          else {
            const sorted = [...intervals].sort((a, b) => a - b);
            const avg = intervals.reduce((s, v) => s + v, 0) / intervals.length;
            const p95 = sorted[Math.floor(sorted.length * 0.95)];
            resolve({ fpsAvg: 1000 / avg, fpsP5: 1000 / p95, frames: intervals.length });
          }
        };
        requestAnimationFrame(tick);
      }),
    seconds,
  );
}

/**
 * Holds a pattern of keys to keep the player running and jumping in loops.
 * @param {import('@playwright/test').Page} page
 * @param {number} seconds
 */
export async function runAround(page, seconds) {
  const end = Date.now() + seconds * 1000;
  let turn = 0;
  while (Date.now() < end) {
    await page.keyboard.down('KeyW');
    const side = turn++ % 2 === 0 ? 'KeyA' : 'KeyD';
    await page.keyboard.down(side);
    await page.waitForTimeout(900);
    await page.keyboard.press('Space');
    await page.waitForTimeout(700);
    await page.keyboard.up(side);
    await page.keyboard.up('KeyW');
    await page.waitForTimeout(150);
  }
}
