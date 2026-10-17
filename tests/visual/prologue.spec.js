import { test as base, expect } from '@playwright/test';
import { keepFocused } from './focus.js';

/** `testQuery` comes from the project (playwright.config.js): '' for WebGPU, 'webgl=1' for forced WebGL2. */
const test = base.extend({ testQuery: ['', { option: true }] });

/** Overview shots of the prologue (fixed cameras) plus the gameplay camera at the spawn. */
const SHOTS = [
  ['10-ridge-run', [-8, 11, 14], [14, 5, 0]],
  ['11-launch-and-arena', [40, 16, 22], [80, 3, 0]],
  ['12-arena', [84, 9, 16], [94, 3, 0]],
  ['13-chase', [108, 9, 14], [125, 2, 0]],
  ['14-standoff-jetty', [150, 6, 10], [168, 2, 0]],
];

test('the prologue builds: storm, flood, ridge route, arena, chase and jetty render without errors', async ({
  page,
  testQuery,
}, testInfo) => {
  const problems = [];
  page.on(
    'console',
    (m) => (m.type() === 'error' || m.type() === 'warning') && problems.push(`${m.type()}: ${m.text()}`),
  );
  page.on('pageerror', (e) => problems.push(`pageerror: ${e.message}`));
  await keepFocused(page);
  await page.goto(`/?${['test=1', testQuery].filter(Boolean).join('&')}`);
  await page.waitForFunction(() => window.__hk?.ready === true, null, { timeout: 120_000 });
  await page.mouse.click(640, 520);
  await page.waitForFunction(() => window.__hk.started && window.__hk.frame > 60);
  await page.waitForTimeout(500);
  await page.screenshot({ path: testInfo.outputPath('00-spawn.png') });
  const spawn = await page.evaluate(() => window.__hk.player());
  expect(spawn.state).toBe('ground');
  for (const [name, position, target] of SHOTS) {
    await page.evaluate(([p, t]) => window.__hk.view(p, t), [position, target]);
    await page.waitForTimeout(350);
    await page.screenshot({ path: testInfo.outputPath(`${name}.png`) });
  }
  await page.evaluate(() => window.__hk.view(null));
  const stats = await page.evaluate(() => window.__hk.stats());
  await testInfo.attach('stats', { body: JSON.stringify(stats, null, 2), contentType: 'application/json' });
  console.info(`[${testInfo.project.name}] ${JSON.stringify(stats)}`);
  expect(problems).toEqual([]);
});
