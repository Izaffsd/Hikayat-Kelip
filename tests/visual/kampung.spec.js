import { expect, test } from './fixtures.js';
import { keepFocused } from './focus.js';

/** Overview shots of Kampung Berembang (fixed cameras) plus the gameplay camera in Bayu's room. */
const SHOTS = [
  ['10-home-and-race-start', [-100, 22, 28], [-50, 2, -2]],
  ['11-race-middle', [-36, 13, 22], [-8, 2, -8]],
  ['12-wallrun-and-deck', [-8, 8, -1], [6, 2, -20]],
  ['13-jetty-and-pondok', [20, 10, -38], [2, 2, -66]],
  ['14-display-view', [2, 2.9, -69.5], [5, 4.5, -106]],
  ['15-rooftops-and-old-jetty', [26, 17, 2], [46, 4, -40]],
  ['16-arena-and-climb', [38, 15, -38], [72, 6, -64]],
  ['17-landmark-from-home', [-77.5, 5.2, 4], [77, 12, -62]],
];

test('the kampung builds: home, race route, jetty, grove, rooftops, old jetty and climb render without errors', async ({
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
  await page.goto(`/?${['test=1', 'scene=kampung', testQuery].filter(Boolean).join('&')}`);
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
