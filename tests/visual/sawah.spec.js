import { expect, test } from './fixtures.js';
import { boot, reach, watch } from './helpers.js';

/** Puts Bayu at (x, z) on the ground, facing (tx, tz), and settles the camera behind him. */
async function lookFrom(page, [x, z], [tx, tz]) {
  await page.evaluate(
    ([x, z, tx, tz]) => {
      const hk = window.__hk;
      hk.teleport([x, 30, z]);
      const yaw = Math.atan2(tx - x, tz - z);
      hk.engine.traversal.facing = yaw;
      hk.engine.cameraSystem.snapBehind(yaw);
    },
    [x, z, tx, tz],
  );
  await page.waitForFunction(() => window.__hk.player().state === 'ground', null, { timeout: 8000 });
  await page.waitForTimeout(900);
}

test('Sawah Emas: the terraces, the village and the festival field, golden hour, both backends', async ({
  page,
  testQuery,
}, testInfo) => {
  test.setTimeout(150_000);
  const problems = [];
  watch(page, problems);
  await boot(page, ['scene=sawah', testQuery]);
  const world = await page.evaluate(() => {
    const w = window.__hk.engine.world;
    return { light: w.dayNight.preset, rice: w.rice.count, fields: w.terrain.fields.length };
  });
  expect(world.light).toBe('golden');
  expect(world.fields).toBe(3);
  expect(world.rice).toBeGreaterThan(1000);
  await lookFrom(page, [36, -2], [70, -40]);
  await page.screenshot({ path: testInfo.outputPath('50-terraces.png') });
  await lookFrom(page, [-40, 52], [70, -40]);
  await page.screenshot({ path: testInfo.outputPath('51-festival-field.png') });
  await lookFrom(page, [-130, 30], [-96, 10]);
  await page.screenshot({ path: testInfo.outputPath('52-village.png') });
  await lookFrom(page, [74, -44], [-30, 48]);
  await page.screenshot({ path: testInfo.outputPath('53-from-the-crown.png') });
  const stats = await page.evaluate(() => window.__hk.stats());
  console.info(
    `[${testInfo.project.name}] sawah: ${JSON.stringify({ ...world, draws: stats['Draw calls'], tris: stats.Triangles, fps: stats.FPS })}`,
  );
  expect(problems).toEqual([]);
});

test('Sawah Emas: Bayu walks from the valley floor up every terrace to the crown', async ({
  page,
  testQuery,
}, testInfo) => {
  test.skip(testInfo.project.name !== 'webgpu', 'walking does not depend on the render backend');
  test.setTimeout(120_000);
  const problems = [];
  watch(page, problems);
  await boot(page, ['scene=sawah', testQuery]);
  await lookFrom(page, [-6, -40], [70, -40]);
  // Run east up the hill's west flank toward the Pelita Bumi, jumping now and then like a player would.
  const result = await page.evaluate(
    () =>
      new Promise((resolve) => {
        const hk = window.__hk;
        const t0 = performance.now();
        let best = -Infinity;
        let lastJump = 0;
        const step = () => {
          const now = performance.now() - t0;
          const p = hk.player();
          best = Math.max(best, p.y);
          const dx = 70 - p.x;
          const dz = -40 - p.z;
          const dist = Math.hypot(dx, dz);
          if (dist < 4 || now > 40_000) {
            hk.drive(null);
            resolve({ best, dist, seconds: now / 1000, y: p.y });
            return;
          }
          hk.drive({ x: dx / dist, z: dz / dist, magnitude: 1 });
          if (now - lastJump > 1800) {
            hk.button('jump', true);
            setTimeout(() => hk.button('jump', false), 60);
            lastJump = now;
          }
          requestAnimationFrame(step);
        };
        requestAnimationFrame(step);
      }),
  );
  console.info(`[${testInfo.project.name}] climb: ${JSON.stringify(result)}`);
  expect(result.dist).toBeLessThan(4);
  expect(result.best).toBeGreaterThan(12);
  expect(problems).toEqual([]);
});

test('Chapter 2 begins: the title, Kelip at Bayu’s side, the Sawah score and beds, the walk to the festival', async ({
  page,
  testQuery,
}, testInfo) => {
  test.skip(testInfo.project.name !== 'webgpu', 'the story does not depend on the render backend');
  test.setTimeout(120_000);
  const problems = [];
  watch(page, problems);
  await boot(page, ['mission=2.1', testQuery]);
  await reach(page, '2.1', 'arrive');
  await expect(page.locator('.hk-title-card')).toHaveClass(/is-visible/);
  await page.waitForFunction(() => window.__hk.story().kelip === true, null, { timeout: 8000 });
  await page.waitForFunction(
    () => {
      const a = window.__hk.audio();
      return a.banks.includes('music_sawah') && a.music.state === 'explore' && 'amb_rice' in a.ambience;
    },
    null,
    { timeout: 20_000 },
  );
  await page.screenshot({ path: testInfo.outputPath('54-chapter-2.png') });
  await page.evaluate(() => window.__hk.teleport([-30, 3, 40]));
  await page.waitForFunction(() => window.__hk.story().completed.includes('2.1'), null, { timeout: 10_000 });
  expect((await page.evaluate(() => window.__hk.savedDoc())).missions.completed['2.1']).toBe(true);
  expect(problems).toEqual([]);
});
