import { keepFocused } from './focus.js';

/**
 * Shared steps for the story browser tests: boot with a query, wait for mission steps, tap buttons, simple bots.
 */

/** Collects console errors and warnings and page errors into `problems`. */
export function watch(page, problems) {
  page.on(
    'console',
    (m) => (m.type() === 'error' || m.type() === 'warning') && problems.push(`${m.type()}: ${m.text()}`),
  );
  page.on('pageerror', (e) => problems.push(`pageerror: ${e.message}`));
}

/** Opens the game with `?test=1` plus `query` parts, starts it and waits for the first frames. */
export async function boot(page, query) {
  await keepFocused(page);
  await page.goto(`/?${['test=1', ...query].filter(Boolean).join('&')}`);
  await page.waitForFunction(() => window.__hk?.ready === true, null, { timeout: 120_000 });
  await page.mouse.click(640, 520);
  await page.waitForFunction(() => window.__hk.started && window.__hk.frame > 30);
}

/** Waits until the story reaches a mission step (and no region is loading). */
export function reach(page, mission, step, timeout = 15_000) {
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
export async function tap(page, action, ms = 60) {
  await page.evaluate((a) => window.__hk.button(a, true), action);
  await page.waitForTimeout(ms);
  await page.evaluate((a) => window.__hk.button(a, false), action);
}

/** Walks to the nearest enemy and strikes when close, until the encounter is over or `seconds` pass. */
export function fight(page, seconds) {
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

/**
 * Runs the 1.1 race line (`paths.race_adi`) at full sprint like a good player: jumps the missing planks and into
 * the wall-run, stops inside the finish trigger. Resolves with the time and respawns.
 */
export function runRaceRoute(page) {
  return page.evaluate(
    () =>
      new Promise((resolve) => {
        const hk = window.__hk;
        const world = hk.engine.world;
        const path = world.paths.race_adi;
        const finish = world.triggers.find((t) => t.id === 'k_finish');
        const jumpAt = new Set([1, 9]);
        let respawns = 0;
        const off = hk.engine.bus.on('player:respawned', () => respawns++);
        let index = 1;
        let release = 0;
        const t0 = performance.now();
        const step = () => {
          const now = performance.now() - t0;
          const p = hk.player();
          if (release && now > release) {
            hk.button('jump', false);
            release = 0;
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
            off();
            resolve({ done, time: now / 1000, respawns });
            return;
          }
          requestAnimationFrame(step);
        };
        requestAnimationFrame(step);
      }),
  );
}
