import { expect, test } from './fixtures.js';
import { keepFocused } from './focus.js';

async function boot(page, scene, testQuery, problems) {
  page.on(
    'console',
    (m) => (m.type() === 'error' || m.type() === 'warning') && problems.push(`${m.type()}: ${m.text()}`),
  );
  page.on('pageerror', (e) => problems.push(`pageerror: ${e.message}`));
  await keepFocused(page);
  await page.goto(`/?${['test=1', `scene=${scene}`, testQuery].filter(Boolean).join('&')}`);
  await page.waitForFunction(() => window.__hk?.ready === true, null, { timeout: 120_000 });
  await page.mouse.click(640, 520);
  await page.waitForFunction(() => window.__hk.started && window.__hk.frame > 30);
}

/** A simple bot: walk to the nearest enemy, strike when close, step away from tells now and then. */
function fight(page, seconds) {
  return page.evaluate(
    (seconds) =>
      new Promise((resolve) => {
        const hk = window.__hk;
        const t0 = performance.now();
        let lastStrike = 0;
        const start = new Map(hk.enemies().map((e) => [e.id, e.vitality]));
        const step = () => {
          const now = performance.now() - t0;
          const p = hk.player();
          const enemies = hk.enemies().filter((e) => e.state !== 'defeated');
          if (!enemies.length || now > seconds * 1000) {
            hk.drive(null);
            const end = new Map(hk.enemies().map((e) => [e.id, e.vitality]));
            let damage = 0;
            for (const [id, v] of start) damage += v - (end.get(id) ?? 0);
            resolve({ damage, left: enemies.length, combat: hk.combat() });
            return;
          }
          const e = enemies.reduce((a, b) =>
            Math.hypot(a.x - p.x, a.z - p.z) < Math.hypot(b.x - p.x, b.z - p.z) ? a : b,
          );
          const dx = e.x - p.x;
          const dz = e.z - p.z;
          const dist = Math.hypot(dx, dz);
          if (dist > 1.7) hk.drive({ x: dx / dist, z: dz / dist, magnitude: 1 });
          else {
            hk.drive({ x: dx / dist, z: dz / dist, magnitude: 0.1 });
            if (now - lastStrike > 320) {
              hk.button('strike', true);
              setTimeout(() => hk.button('strike', false), 40);
              lastStrike = now;
            }
          }
          requestAnimationFrame(step);
        };
        requestAnimationFrame(step);
      }),
    seconds,
  );
}

test('silat in the sandbox: cursed brawler under ink, wisps, strikes land and enemies give way', async ({
  page,
  testQuery,
}, testInfo) => {
  test.setTimeout(150_000);
  const problems = [];
  await boot(page, 'sandbox', testQuery, problems);
  await page.evaluate(() => {
    window.__hk.teleport([0, 0.05, 25]);
    window.__hk.encounter('sandbox_mixed');
  });
  await page.waitForTimeout(1600);
  await page.evaluate(() => window.__hk.view([3.5, 2.6, 26], [0, 1.1, 33]));
  await page.waitForTimeout(300);
  await page.screenshot({ path: testInfo.outputPath('10-encounter.png') });
  await page.evaluate(() => window.__hk.view(null));
  const result = await fight(page, 25);
  await page.screenshot({ path: testInfo.outputPath('11-after-fight.png') });
  console.info(`[${testInfo.project.name}] sandbox fight: ${JSON.stringify(result)}`);
  expect(result.damage).toBeGreaterThan(40);
  expect(problems).toEqual([]);
});

test('the prologue arena trigger starts the wisp fight', async ({ page, testQuery }, testInfo) => {
  test.setTimeout(150_000);
  const problems = [];
  await boot(page, 'prologue', testQuery, problems);
  await page.evaluate(() => window.__hk.teleport([92, 2.65, 0]));
  await page.waitForFunction(() => window.__hk.enemies().length === 4, null, { timeout: 10_000 });
  await page.waitForTimeout(1500);
  await page.evaluate(() => window.__hk.view([86.5, 5.2, 7], [95, 3.2, 0]));
  await page.waitForTimeout(300);
  await page.screenshot({ path: testInfo.outputPath('20-wisps.png') });
  await page.evaluate(() => window.__hk.view(null));
  const result = await fight(page, 20);
  console.info(`[${testInfo.project.name}] prologue fight: ${JSON.stringify(result)}`);
  expect(result.damage).toBeGreaterThan(30);
  expect(problems).toEqual([]);
});

test('Cursed Adi waits on the old jetty arena with his corruption bar', async ({
  page,
  testQuery,
}, testInfo) => {
  test.setTimeout(150_000);
  const problems = [];
  await boot(page, 'kampung', testQuery, problems);
  await page.evaluate(() => window.__hk.teleport([53, 2.45, -57]));
  await page.waitForFunction(() => window.__hk.enemies().some((e) => e.archetype === 'adi'), null, {
    timeout: 10_000,
  });
  await page.waitForTimeout(1800);
  await page.screenshot({ path: testInfo.outputPath('30-adi.png') });
  await page.evaluate(() => window.__hk.view([56.5, 4.2, -57.5], [53, 3.3, -63]));
  await page.waitForTimeout(300);
  await page.screenshot({ path: testInfo.outputPath('31-adi-close.png') });
  expect(problems).toEqual([]);
});
