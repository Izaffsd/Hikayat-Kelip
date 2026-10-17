import { test as base, expect } from '@playwright/test';
import { keepFocused } from './focus.js';

const test = base.extend({ testQuery: ['', { option: true }] });

/**
 * A bot runs mission 1.1's race route in Kampung Berembang along the layout's `race_adi` line (the line Adi will
 * race): sprint, jump the missing planks, mantle onto the drying platform, drop off it, jump into the wall-run
 * beside the boat shed and land on the waterfront deck. Validates the level geometry and the moves together.
 */
test('a bot runs the kampung race route to the finish without falling in', async ({
  page,
  testQuery,
}, testInfo) => {
  test.setTimeout(120_000);
  const problems = [];
  page.on('console', (m) => (m.type() === 'error' || m.type() === 'warning') && problems.push(m.text()));
  page.on('pageerror', (e) => problems.push(e.message));
  await keepFocused(page);
  await page.goto(`/?${['test=1', 'scene=kampung', testQuery].filter(Boolean).join('&')}`);
  await page.waitForFunction(() => window.__hk?.ready === true, null, { timeout: 120_000 });
  await page.mouse.click(640, 520);
  await page.waitForFunction(() => window.__hk.started && window.__hk.frame > 30);
  await page.evaluate(() => window.__hk.teleport([-73.4, 1.05, 4.5]));
  await page.waitForTimeout(600);

  const run = await page.evaluate(
    () =>
      new Promise((resolve) => {
        const hk = window.__hk;
        const world = hk.engine.world;
        const path = world.paths.race_adi;
        const finish = world.triggers.find((t) => t.id === 'k_finish');
        const jumpAt = new Set([1, 9]); // the missing planks, the wall-run
        let respawns = 0;
        hk.engine.bus.on('player:respawned', () => respawns++);
        const states = [];
        let index = 1;
        let lastState = '';
        let release = 0;
        const t0 = performance.now();
        const step = () => {
          const now = performance.now() - t0;
          const p = hk.player();
          if (release && now > release) {
            hk.button('jump', false);
            release = 0;
          }
          if (p.state !== lastState) {
            states.push([p.state, index, Math.round(now), +p.x.toFixed(1), +p.y.toFixed(2), +p.z.toFixed(1)]);
            lastState = p.state;
          }
          const target = path[index];
          const dx = target.x - p.x;
          const dz = target.z - p.z;
          const dist = Math.hypot(dx, dz);
          if (dist < 0.9 && index < path.length - 1) {
            if (jumpAt.has(index)) {
              hk.button('jump', true);
              release = now + 260;
            }
            index++;
          }
          hk.drive({ x: dx / (dist || 1), z: dz / (dist || 1), magnitude: 1, sprintHeld: true });
          const c = finish.center;
          const h = finish.half;
          const done = Math.abs(p.x - c.x) <= h.x && Math.abs(p.y - c.y) <= h.y && Math.abs(p.z - c.z) <= h.z;
          if (done || now > 45_000) {
            hk.drive(null);
            resolve({ done, time: now / 1000, respawns, index, states });
            return;
          }
          requestAnimationFrame(step);
        };
        requestAnimationFrame(step);
      }),
  );
  await page.screenshot({ path: testInfo.outputPath('finish.png') });
  await testInfo.attach('run', { body: JSON.stringify(run, null, 2), contentType: 'application/json' });
  console.info(
    `[${testInfo.project.name}] race: ${run.done ? 'finished' : 'DNF'} in ${run.time.toFixed(1)} s, respawns ${run.respawns}`,
  );
  console.info(JSON.stringify(run.states));
  expect(run.respawns).toBe(0);
  expect(run.done).toBe(true);
  const seen = new Set(run.states.map((s) => s[0]));
  expect(seen.has('mantle')).toBe(true);
  expect(seen.has('wallRun')).toBe(true);
  expect(run.time).toBeLessThan(30);
  expect(problems).toEqual([]);
});
