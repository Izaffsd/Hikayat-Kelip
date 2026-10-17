import { expect, test } from './fixtures.js';
import { boot, fight, reach, runRaceRoute, tap, watch } from './helpers.js';

const story = (page) => page.evaluate(() => window.__hk.story());
const npcs = (page) => page.evaluate(() => window.__hk.npcs());

test('1.1: Mak Som at her stall, Adi’s dare, a held start, the race clock and both results', async ({
  page,
  testQuery,
}, testInfo) => {
  test.setTimeout(240_000);
  const problems = [];
  watch(page, problems);
  await boot(page, ['mission=1.1', testQuery]);
  await reach(page, '1.1', 'wake');
  await page.waitForFunction(() => window.__hk.npcs().maksom?.mode === 'idle', null, { timeout: 15_000 });
  await page.evaluate(() => window.__hk.teleport([-80.5, 3.45, 4]));
  await reach(page, '1.1', 'dare');
  await page.waitForFunction(() => window.__hk.npcs().adi?.mode === 'idle', null, { timeout: 15_000 });
  await page.evaluate(() => window.__hk.teleport([-73, 1.05, 4]));
  await reach(page, '1.1', 'race');
  // "Ready… go!": Bayu is held still until the line ends, then the clock and Adi start together.
  expect(await page.evaluate(() => window.__hk.engine.story.still)).toBe(true);
  await page.waitForTimeout(700);
  await page.screenshot({ path: testInfo.outputPath('10-ready.png') });
  // (The dare line from the walk over is still playing here, since the test teleports; the banter follows it.)
  await page.waitForFunction(() => window.__hk.race()?.running, null, { timeout: 20_000 });
  expect(await page.evaluate(() => window.__hk.engine.story.still)).toBe(false);
  expect((await npcs(page)).adi.mode).toBe('run');
  const run = await runRaceRoute(page);
  console.info(`[${testInfo.project.name}] race run: ${JSON.stringify(run)}`);
  expect(run.done).toBe(true);
  expect(run.respawns).toBe(0);
  await reach(page, '1.1', 'stall');
  await expect(page.locator('.hk-race__result')).toHaveClass(/is-visible/);
  await page.waitForTimeout(400);
  await page.screenshot({ path: testInfo.outputPath('11-won.png') });
  const won = await story(page);
  expect(won.flags['race_1.1_won']).toBe(true);
  const best = (await page.evaluate(() => window.__hk.race())).best['1.1'];
  expect(best).toBeGreaterThan(8);
  expect(best).toBeLessThan(20);

  // Again, but let Adi arrive first.
  await page.evaluate(() => window.__hk.mission('1.1', 'race'));
  await page.waitForFunction(() => window.__hk.race()?.running, null, { timeout: 20_000 });
  await page.waitForFunction(() => window.__hk.npcs().adi.arrived, null, { timeout: 40_000 });
  const adiTime = (await page.evaluate(() => window.__hk.race())).seconds;
  console.info(`[${testInfo.project.name}] Adi's time ${adiTime.toFixed(2)} s, best ${best} s`);
  expect(adiTime).toBeGreaterThan(best); // a clean sprint beats Adi
  await page.evaluate(() => window.__hk.teleport([2, 1.25, -21]));
  await reach(page, '1.1', 'stall');
  expect((await story(page)).flags['race_1.1_won']).toBe(false);
  expect((await page.evaluate(() => window.__hk.race())).best['1.1']).toBe(best);
  await reach(page, '1.2', 'pondok', 30_000);
  expect(problems).toEqual([]);
});

test('1.3: Adi flees ahead over the night roofs while the tide floods the boardwalks', async ({
  page,
  testQuery,
}, testInfo) => {
  test.setTimeout(200_000);
  const problems = [];
  watch(page, problems);
  await boot(page, ['mission=1.3', testQuery]);
  await reach(page, '1.3', 'rooftops');
  await page.evaluate(() => window.__hk.teleport([17, 3.45, -22]));
  await reach(page, '1.3', 'oldJetty');
  await page.waitForFunction(() => window.__hk.npcs().adi?.mode === 'flee', null, { timeout: 15_000 });
  await page.waitForTimeout(600);
  await page.screenshot({ path: testInfo.outputPath('20-adi-on-the-roofs.png') });
  // Follow his line in hops and check he stays ahead.
  const samples = await page.evaluate(async () => {
    const hk = window.__hk;
    const path = hk.engine.world.paths.adi_rooftops;
    const out = [];
    for (let i = 0; i < path.length - 2; i++) {
      const p = path[i];
      hk.teleport([p.x, p.y + 0.2, p.z]);
      await new Promise((r) => setTimeout(r, 700));
      const adi = hk.npcs().adi;
      out.push({ at: i, x: p.x, adi: adi ? Math.round(adi.x * 10) / 10 : null, mode: adi?.mode });
    }
    return out;
  });
  console.info(`[${testInfo.project.name}] rooftops: ${JSON.stringify(samples)}`);
  for (const s of samples) if (s.mode === 'flee') expect(s.adi, JSON.stringify(s)).toBeGreaterThan(s.x + 1);
  // The tide rises over the boardwalks (top 1.0) toward 1.3 (D-032); respawn safety is in the unit tests.
  await page.waitForFunction(() => window.__hk.water() > 1.05, null, { timeout: 40_000 });
  await page.evaluate(() => window.__hk.view([-25, 6, 12], [-30, 1, 2]));
  await page.waitForTimeout(300);
  await page.screenshot({ path: testInfo.outputPath('21-flooded-boardwalks.png') });
  await page.evaluate(() => window.__hk.view(null));
  await page.evaluate(() => window.__hk.teleport([53, 2.45, -25]));
  await reach(page, '1.4', 'arena', 20_000);
  expect(problems).toEqual([]);
});

test('1.4: Cursed Adi is freed, the tide goes out, the climb, and the Pelita Air relights the fireflies', async ({
  page,
  testQuery,
}, testInfo) => {
  test.setTimeout(200_000);
  const problems = [];
  watch(page, problems);
  await boot(page, ['mission=1.4', testQuery]);
  await reach(page, '1.4', 'arena');
  expect(await page.evaluate(() => window.__hk.water())).toBeCloseTo(1.3, 1);
  await page.evaluate(() => window.__hk.teleport([53, 2.45, -57]));
  await reach(page, '1.4', 'adi');
  await page.waitForFunction(() => window.__hk.enemies().some((e) => e.archetype === 'adi'), null, {
    timeout: 10_000,
  });
  // Shorten the boss: his corruption is nearly gone.
  await page.evaluate(() => {
    for (const e of window.__hk.engine.director.enemies) e.vitality = 8;
  });
  const fought = await fight(page, 60);
  console.info(`[${testInfo.project.name}] Adi: ${JSON.stringify(fought)}`);
  await page.waitForFunction(() => window.__hk.story().cutscene === 'k_adi_freed', null, { timeout: 15_000 });
  await page.waitForTimeout(4500);
  await page.screenshot({ path: testInfo.outputPath('30-adi-freed.png') });
  await reach(page, '1.4', 'climb', 20_000);
  const adi = (await npcs(page)).adi;
  expect(adi.mode).toBe('idle');
  expect(adi.ink).toBeLessThan(0.05);
  expect((await story(page)).flags.adi_freed).toBe(true);
  expect(await page.evaluate(() => window.__hk.enemies().length)).toBe(0);
  await page.waitForFunction(() => window.__hk.water() < 0.3, null, { timeout: 15_000 });

  await page.evaluate(() => window.__hk.teleport([72.5, 13.05, -61.2]));
  await reach(page, '1.4', 'relight');
  await page.waitForTimeout(300);
  await tap(page, 'context', 120);
  await page.waitForFunction(() => window.__hk.story().cutscene === 'k_pelita_air', null, { timeout: 5000 });
  await page.waitForTimeout(3000);
  await page.screenshot({ path: testInfo.outputPath('31-pelita-lit.png') });
  await page.waitForTimeout(7000);
  await page.screenshot({ path: testInfo.outputPath('32-fireflies-return.png') });
  await page.waitForFunction(() => window.__hk.story().completed.includes('1.4'), null, { timeout: 15_000 });
  const end = await story(page);
  expect(end.flags.pelita_air).toBe(true);
  expect(end.pages).toEqual([1]);
  expect((await page.evaluate(() => window.__hk.savedDoc())).missions.completed['1.4']).toBe(true);
  expect(problems).toEqual([]);
});
