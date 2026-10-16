import { test as base, expect } from '@playwright/test';

const test = base.extend({ testQuery: ['', { option: true }] });

/**
 * Drives the sandbox with real keyboard input and checks movement numerically (both backends):
 * running covers ground, sprint builds by itself, a held jump reaches the tuned height, and the
 * player lands back on the ground.
 */
test('running, sprint build-up and a held jump behave as tuned', async ({ page, testQuery }) => {
  const problems = [];
  page.on('console', (m) => (m.type() === 'error' || m.type() === 'warning') && problems.push(m.text()));
  page.on('pageerror', (e) => problems.push(e.message));
  await page.goto(`/?${['test=1', testQuery].filter(Boolean).join('&')}`);
  await page.waitForFunction(() => window.__hk?.ready === true, null, { timeout: 90_000 });
  await page.mouse.click(640, 520);
  await page.waitForFunction(() => window.__hk.started && window.__hk.frame > 30);

  const start = await page.evaluate(() => window.__hk.player());
  expect(start.state).toBe('ground');

  // Run forward (camera looks toward −Z at spawn) for one second.
  await page.keyboard.down('KeyW');
  await page.waitForTimeout(1000);
  const afterRun = await page.evaluate(() => window.__hk.player());
  expect(start.z - afterRun.z).toBeGreaterThan(3.5);
  expect(afterRun.speed).toBeGreaterThan(5);

  // Sprint builds after ~0.9 s of full tilt.
  await page.waitForTimeout(300);
  const sprinting = await page.evaluate(() => window.__hk.player());
  expect(sprinting.speed).toBeGreaterThan(6.5);
  await page.keyboard.up('KeyW');
  await page.waitForTimeout(800);

  // Held jump: sample the height every frame until landing.
  await page.keyboard.down('Space');
  const jump = await page.evaluate(
    () =>
      new Promise((resolve) => {
        const base = window.__hk.player().y;
        let apex = base;
        let airborne = false;
        const startTime = performance.now();
        const sample = () => {
          const p = window.__hk.player();
          apex = Math.max(apex, p.y);
          if (p.state === 'air') airborne = true;
          if ((airborne && p.state === 'ground') || performance.now() - startTime > 3000) {
            resolve({ apex: apex - base, airborne, landedState: p.state, landedY: p.y - base });
          } else {
            requestAnimationFrame(sample);
          }
        };
        requestAnimationFrame(sample);
      }),
  );
  await page.keyboard.up('Space');
  expect(jump.airborne).toBe(true);
  expect(jump.apex).toBeGreaterThan(1.1);
  expect(jump.apex).toBeLessThan(1.45);
  expect(jump.landedState).toBe('ground');
  expect(Math.abs(jump.landedY)).toBeLessThan(0.05);
  expect(problems).toEqual([]);
});
