import { expect, test } from './fixtures.js';

async function boot(page, query) {
  await page.goto(`/?${['test=1', ...query].filter(Boolean).join('&')}`);
  await page.waitForFunction(() => window.__hk?.ready === true, null, { timeout: 120_000 });
  await page.mouse.click(640, 520);
  await page.waitForFunction(() => window.__hk.started && window.__hk.frame > 30);
}

function watch(page, problems) {
  page.on(
    'console',
    (m) => (m.type() === 'error' || m.type() === 'warning') && problems.push(`${m.type()}: ${m.text()}`),
  );
  page.on('pageerror', (e) => problems.push(`pageerror: ${e.message}`));
}

test('Tok Belang: gallop, walk and the standoff crouch, animated in code', async ({
  page,
  testQuery,
}, testInfo) => {
  test.setTimeout(150_000);
  const problems = [];
  watch(page, problems);
  await boot(page, ['mission=P', 'step=chase', testQuery]);
  await page.waitForFunction(() => window.__hk.tiger()?.mode === 'chase', null, { timeout: 15_000 });
  await page.waitForTimeout(1200);
  await page.screenshot({ path: testInfo.outputPath('00-chase-from-wan.png') });

  // Side views of each gait, held in place on the open jetty (the tiger looks along +X, toward the jetty's end).
  const at = { x: 160, y: 1.8, z: 0 };
  const shots = [
    ['10-gallop-a', 9, false, 0],
    ['11-gallop-b', 9, false, 170],
    ['12-gallop-c', 9, false, 340],
    ['13-walk', 1.4, false, 0],
    ['14-crouch', 0, true, 0],
  ];
  for (const [name, speed, crouch, wait] of shots) {
    await page.evaluate(
      ([a, s, c]) => window.__hk.engine.story.tiger.preview(a, Math.PI / 2, s, c),
      [at, speed, crouch],
    );
    await page.evaluate(
      ([x, y, z]) => window.__hk.view([x, y + 1.3, z + 5.2], [x, y + 0.8, z]),
      [at.x, at.y, at.z],
    );
    await page.waitForTimeout(600 + wait);
    await page.screenshot({ path: testInfo.outputPath(`${name}.png`) });
  }
  await page.evaluate(() => window.__hk.engine.story.tiger.roar());
  await page.waitForTimeout(500);
  await page.screenshot({ path: testInfo.outputPath('15-roar.png') });
  await page.evaluate(() => window.__hk.view(null));
  expect(problems).toEqual([]);
});

test('the chase: Tok Belang keeps ahead of Wan along the route and waits at the standoff', async ({
  page,
  testQuery,
}, testInfo) => {
  test.setTimeout(150_000);
  const problems = [];
  watch(page, problems);
  await boot(page, ['mission=P', 'step=chase', testQuery]);
  await page.waitForFunction(() => window.__hk.tiger()?.mode === 'chase', null, { timeout: 15_000 });
  // Move Wan along the tiger's own path in hops (a stand-in for a player running it) and record the lead.
  const leads = await page.evaluate(async () => {
    const hk = window.__hk;
    const path = hk.engine.world.paths.tiger;
    const out = [];
    for (let x = path[0].x - 4; x <= 166; x += 3) {
      // Height of the route here: the path's height at this x (feet a little above it).
      let y = path[path.length - 1].y;
      for (let i = 1; i < path.length; i++) {
        if (x <= path[i].x) {
          const u = (x - path[i - 1].x) / (path[i].x - path[i - 1].x || 1);
          y = path[i - 1].y + (path[i].y - path[i - 1].y) * Math.max(0, Math.min(1, u));
          break;
        }
      }
      hk.teleport([x, y + 0.6, 0]);
      await new Promise((r) => setTimeout(r, 450));
      const t = hk.tiger();
      out.push({ x, tiger: Math.round(t.x * 10) / 10, mode: t.mode, speed: Math.round(t.speed * 10) / 10 });
    }
    return out;
  });
  console.info(`[${testInfo.project.name}] chase: ${JSON.stringify(leads)}`);
  for (const sample of leads) {
    if (sample.mode === 'chase') expect(sample.tiger - sample.x, JSON.stringify(sample)).toBeGreaterThan(4);
  }
  await page.waitForFunction(() => window.__hk.tiger().mode === 'standoff', null, { timeout: 10_000 });
  const end = await page.evaluate(() => window.__hk.tiger());
  expect(end.x).toBeCloseTo(175.5, 0);
  await page.screenshot({ path: testInfo.outputPath('20-waiting.png') });
  expect(problems).toEqual([]);
});
