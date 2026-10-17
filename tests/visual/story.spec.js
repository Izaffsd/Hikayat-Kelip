import { expect, test } from './fixtures.js';
import { keepFocused } from './focus.js';

function watch(page, problems) {
  page.on(
    'console',
    (m) => (m.type() === 'error' || m.type() === 'warning') && problems.push(`${m.type()}: ${m.text()}`),
  );
  page.on('pageerror', (e) => problems.push(`pageerror: ${e.message}`));
}

async function boot(page, query) {
  await page.goto(`/?${['test=1', ...query].filter(Boolean).join('&')}`);
  await page.waitForFunction(() => window.__hk?.ready === true, null, { timeout: 120_000 });
  await page.mouse.click(640, 520);
  await page.waitForFunction(() => window.__hk.started && window.__hk.frame > 30);
}

const story = (page) => page.evaluate(() => window.__hk.story());

/** Waits until the story reaches a mission step (and no region is loading). */
function reach(page, mission, step, timeout = 15_000) {
  return page.waitForFunction(
    ([m, s]) => {
      const st = window.__hk.story();
      return st && !st.loading && st.mission === m && st.step === s;
    },
    [mission, step],
    { timeout },
  );
}

/** Taps a game action as a virtual button. */
async function tap(page, action, ms = 60) {
  await page.evaluate((a) => window.__hk.button(a, true), action);
  await page.waitForTimeout(ms);
  await page.evaluate((a) => window.__hk.button(a, false), action);
}

/** A simple bot: walk to the nearest enemy and strike when close, until the encounter is over. */
function fight(page, seconds) {
  return page.evaluate(
    (seconds) =>
      new Promise((resolve) => {
        const hk = window.__hk;
        const t0 = performance.now();
        let lastStrike = 0;
        const step = () => {
          const now = performance.now() - t0;
          const p = hk.player();
          const enemies = hk.enemies().filter((e) => e.state !== 'defeated' && e.state !== 'freed');
          if (!enemies.length || now > seconds * 1000) {
            hk.drive(null);
            resolve({ left: enemies.length, seconds: now / 1000 });
            return;
          }
          const e = enemies.reduce((a, b) =>
            Math.hypot(a.x - p.x, a.z - p.z) < Math.hypot(b.x - p.x, b.z - p.z) ? a : b,
          );
          const dx = e.x - p.x;
          const dz = e.z - p.z;
          const dist = Math.hypot(dx, dz) || 1;
          hk.drive({ x: dx / dist, z: dz / dist, magnitude: dist > 1.7 ? 1 : 0.1 });
          if (dist <= 1.7 && now - lastStrike > 320) {
            hk.button('strike', true);
            setTimeout(() => hk.button('strike', false), 40);
            lastStrike = now;
          }
          requestAnimationFrame(step);
        };
        requestAnimationFrame(step);
      }),
    seconds,
  );
}

test('a new save plays the prologue as mission P, cuts to black and wakes Bayu in Chapter 1; a reload resumes', async ({
  page,
  testQuery,
}, testInfo) => {
  test.setTimeout(240_000);
  const problems = [];
  watch(page, problems);
  await keepFocused(page);
  await boot(page, [testQuery]);
  await reach(page, 'P', 'roofs');
  // The mission's first step is a save point.
  const first = await page.evaluate(() => window.__hk.savedDoc().checkpoint);
  expect(first).toMatchObject({ region: 'prologue', mission: 'P', step: 'roofs' });
  await expect(page.locator('.hk-prompt')).toHaveClass(/is-visible/);
  await expect(page.locator('.hk-subtitle')).toHaveClass(/is-visible/);

  // Kelip's call: the objective shows only after a call (TECHNICAL §11), and the guide motes leave Bayu.
  await expect(page.locator('.hk-objective')).not.toHaveClass(/is-visible/);
  await tap(page, 'kelip');
  await expect(page.locator('.hk-objective')).toHaveClass(/is-visible/);
  await page.waitForTimeout(500);
  await page.screenshot({ path: testInfo.outputPath('00-roofs-call.png') });

  await page.evaluate(() => window.__hk.teleport([51.1, 6.5, 0]));
  await reach(page, 'P', 'glide');
  await page.evaluate(() => window.__hk.teleport([92, 2.65, 0]));
  await reach(page, 'P', 'wisps');
  await page.waitForFunction(() => window.__hk.enemies().length === 4, null, { timeout: 10_000 });
  const fought = await fight(page, 60);
  console.info(`[${testInfo.project.name}] prologue wisps: ${JSON.stringify(fought)}`);
  await reach(page, 'P', 'chase');
  expect((await page.evaluate(() => window.__hk.savedDoc().checkpoint)).step).toBe('chase');

  // Tok Belang flees ahead; at the wall-run a close lightning strike (the near-miss).
  await page.waitForFunction(() => window.__hk.tiger()?.mode === 'chase', null, { timeout: 10_000 });
  await page.evaluate(() => window.__hk.teleport([118, 2.2, 0.4]));
  await reach(page, 'P', 'flood');

  // The standoff: letterbox, the tiger waiting, Wan raising the tongkat, then hold to skip; the cut to black, the
  // region change and Chapter 1 as Bayu.
  await page.evaluate(() => window.__hk.teleport([164.5, 1.85, 0]));
  await page.waitForFunction(() => window.__hk.story().cutscene === 'p_standoff', null, { timeout: 10_000 });
  await page.waitForTimeout(2000);
  await expect(page.locator('.hk-letterbox')).toHaveClass(/is-on/);
  await page.screenshot({ path: testInfo.outputPath('10-standoff.png') });
  expect((await page.evaluate(() => window.__hk.tiger())).mode).toMatch(/standoff/);
  await page.waitForTimeout(2600);
  await page.screenshot({ path: testInfo.outputPath('10b-standoff-wan.png') });
  expect(await page.evaluate(() => window.__hk.playerModel())).toEqual({
    model: 'wan_young',
    pose: 'stance',
  });
  await page.evaluate(() => window.__hk.button('jump', true));
  await page.waitForTimeout(900);
  await page.evaluate(() => window.__hk.button('jump', false));
  await reach(page, '1.1', 'wake', 30_000);
  const awake = await story(page);
  expect(awake.region).toBe('kampung');
  expect(awake.completed).toContain('P');
  expect(await page.evaluate(() => window.__hk.playerModel())).toEqual({ model: 'bayu', pose: null });
  expect(await page.evaluate(() => window.__hk.tiger())).toBeNull();
  await page.waitForTimeout(1200);
  await page.screenshot({ path: testInfo.outputPath('11-bayu-wakes.png') });
  const saved = await page.evaluate(() => window.__hk.savedDoc());
  expect(saved.checkpoint).toMatchObject({ region: 'kampung', mission: '1.1', step: 'wake' });
  expect(saved.missions.completed.P).toBe(true);
  const player = await page.evaluate(() => window.__hk.player());
  expect(player.state).toBe('ground');

  // Reload: the save resumes Chapter 1 in the kampung.
  await boot(page, [testQuery]);
  await reach(page, '1.1', 'wake');
  expect((await story(page)).region).toBe('kampung');
  const stats = await page.evaluate(() => window.__hk.stats());
  console.info(`[${testInfo.project.name}] after reload: ${JSON.stringify(stats)}`);
  expect(problems).toEqual([]);
});

test('1.2: Kelip rises from the hikayat, the call, the display goes dark, the jetty fight, the first reward', async ({
  page,
  testQuery,
}, testInfo) => {
  test.setTimeout(240_000);
  const problems = [];
  watch(page, problems);
  await keepFocused(page);
  await boot(page, ['mission=1.2', testQuery]);
  await reach(page, '1.2', 'pondok');
  await page.evaluate(() => window.__hk.teleport([2, 1.25, -63]));
  await reach(page, '1.2', 'hikayat');
  await page.evaluate(() => window.__hk.teleport([2, 1.25, -63.8]));
  await page.waitForTimeout(400);
  await tap(page, 'context');
  await page.waitForFunction(() => window.__hk.story().cutscene === 'k_kelip_rise', null, { timeout: 5000 });
  await page.waitForTimeout(3600);
  await page.screenshot({ path: testInfo.outputPath('20-kelip-rises.png') });
  await reach(page, '1.2', 'call', 15_000);
  expect((await story(page)).kelip).toBe(true);
  expect((await story(page)).flags.kelip_awake).toBe(true);
  await page.waitForTimeout(800);
  await page.screenshot({ path: testInfo.outputPath('21-kelip-at-side.png') });

  await tap(page, 'kelip');
  await page.waitForFunction(() => window.__hk.story().cutscene === 'k_display', null, { timeout: 8000 });
  await page.waitForTimeout(3000);
  await page.screenshot({ path: testInfo.outputPath('22-display-lit.png') });
  await page.waitForTimeout(9500);
  await page.screenshot({ path: testInfo.outputPath('23-display-dark.png') });
  await reach(page, '1.2', 'fight', 15_000);
  expect((await page.evaluate(() => window.__hk.savedDoc().checkpoint)).step).toBe('fight');
  await page.waitForFunction(() => window.__hk.enemies().length === 3, null, { timeout: 10_000 });
  const fought = await fight(page, 60);
  console.info(`[${testInfo.project.name}] jetty wisps: ${JSON.stringify(fought)}`);
  await reach(page, '1.2', 'adi', 10_000);
  await expect(page.locator('.hk-title-card')).toHaveClass(/is-visible/);
  await page.waitForTimeout(600);
  await page.screenshot({ path: testInfo.outputPath('24-chapter-title.png') });
  await reach(page, '1.3', 'rooftops', 20_000);
  const st = await story(page);
  expect(st.journal).toEqual(['j.tokwan.1']);
  expect(st.cahaya).toBe(1);
  expect((await page.evaluate(() => window.__hk.savedDoc().checkpoint)).mission).toBe('1.3');
  expect(problems).toEqual([]);
});
