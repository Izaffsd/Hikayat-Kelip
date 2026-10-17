import { expect, test } from './fixtures.js';
import { keepFocused } from './focus.js';

test('title paints, the engine boots, a tap starts the game and the sandbox renders', async ({
  page,
  testQuery,
}, testInfo) => {
  const problems = [];
  page.on('console', (message) => {
    if (message.type() === 'error' || message.type() === 'warning') {
      problems.push(`${message.type()}: ${message.text()}`);
    }
  });
  page.on('pageerror', (error) => problems.push(`pageerror: ${error.message}`));

  const query = ['test=1', 'scene=sandbox', testQuery].filter(Boolean).join('&');
  await keepFocused(page);
  await page.goto(`/?${query}`);
  await expect(page.locator('#title-name')).toBeVisible();
  await page.waitForTimeout(600);
  await page.screenshot({ path: testInfo.outputPath('01-title.png') });

  await page.waitForFunction(() => window.__hk?.ready === true, null, { timeout: 90_000 });
  const backend = await page.evaluate(() => window.__hk.backend);
  expect(backend).toBe(testQuery.includes('webgl=1') ? 'webgl2' : 'webgpu');

  await page.mouse.click(640, 520);
  await page.waitForFunction(() => window.__hk.started && window.__hk.frame > 90, null, { timeout: 30_000 });
  await page.screenshot({ path: testInfo.outputPath('02-sandbox.png') });

  await page.keyboard.down('KeyW');
  await page.waitForTimeout(1500);
  await page.keyboard.press('Space');
  await page.waitForTimeout(250);
  await page.screenshot({ path: testInfo.outputPath('03-running-jump.png') });
  await page.keyboard.up('KeyW');
  await page.waitForTimeout(600);

  await page.keyboard.press('F3');
  await page.waitForTimeout(700);
  await page.screenshot({ path: testInfo.outputPath('04-debug-overlay.png') });

  const stats = await page.evaluate(() => window.__hk.stats());
  await testInfo.attach('stats', { body: JSON.stringify(stats, null, 2), contentType: 'application/json' });
  console.info(`[${testInfo.project.name}] ${JSON.stringify(stats)}`);
  expect(problems).toEqual([]);
});
