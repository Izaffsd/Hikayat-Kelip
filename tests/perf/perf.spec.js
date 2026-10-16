import { test as base, expect } from '@playwright/test';
import { measureFps, openAndStart, runAround } from './helpers.js';

const test = base.extend({ testQuery: ['', { option: true }] });

const SOAK_MINUTES = Number(process.env.HK_SOAK_MINUTES || 10);

test('4× CPU throttle: frame rate stays playable', async ({ page, testQuery }, testInfo) => {
  await openAndStart(page, testQuery);
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
  const running = runAround(page, 12);
  await page.waitForTimeout(2000);
  const fps = await measureFps(page, 8);
  await running;
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 1 });
  const stats = await page.evaluate(() => window.__hk.stats());
  const result = { project: testInfo.project.name, throttle: 4, ...fps, stats };
  await testInfo.attach('throttled-fps', {
    body: JSON.stringify(result, null, 2),
    contentType: 'application/json',
  });
  console.info(`[perf] ${JSON.stringify(result)}`);
  expect(fps.fpsAvg).toBeGreaterThan(30);
});

test('performance trace of the sandbox (long tasks)', async ({ page, browser, testQuery }, testInfo) => {
  await openAndStart(page, testQuery);
  const tracePath = testInfo.outputPath('trace.json');
  await browser.startTracing(page, { path: tracePath, screenshots: false });
  await runAround(page, 5);
  const buffer = await browser.stopTracing();
  const trace = JSON.parse(buffer.toString('utf8'));
  const events = Array.isArray(trace) ? trace : trace.traceEvents;
  const longTasks = events
    .filter((e) => e.name === 'RunTask' && e.dur > 50_000)
    .map((e) => Math.round(e.dur / 1000));
  const result = {
    project: testInfo.project.name,
    longTasksOver50ms: longTasks.length,
    longestMs: Math.max(0, ...longTasks),
  };
  await testInfo.attach('trace-summary', {
    body: JSON.stringify(result, null, 2),
    contentType: 'application/json',
  });
  console.info(`[perf] ${JSON.stringify(result)}`);
  expect(longTasks.length).toBeLessThanOrEqual(2);
});

test(`memory soak: no heap growth over ${SOAK_MINUTES} minutes`, async ({ page, testQuery }, testInfo) => {
  test.setTimeout((SOAK_MINUTES + 3) * 60 * 1000);
  await openAndStart(page, testQuery);
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('HeapProfiler.enable');
  const heap = async () => {
    await cdp.send('HeapProfiler.collectGarbage');
    const { usedSize } = await cdp.send('Runtime.getHeapUsage');
    const gpu = await page.evaluate(() => window.__hk.stats()['Geo / Tex']);
    return { mb: Math.round((usedSize / 1048576) * 10) / 10, gpu };
  };
  await runAround(page, 20); // warm up caches and shaders before the baseline
  const samples = [{ minute: 0, ...(await heap()) }];
  for (let minute = 1; minute <= SOAK_MINUTES; minute++) {
    await runAround(page, 60);
    samples.push({ minute, ...(await heap()) });
  }
  const growth = samples.at(-1).mb - samples[0].mb;
  const result = { project: testInfo.project.name, samples, growthMb: Math.round(growth * 10) / 10 };
  await testInfo.attach('memory-soak', {
    body: JSON.stringify(result, null, 2),
    contentType: 'application/json',
  });
  console.info(`[perf] ${JSON.stringify(result)}`);
  expect(growth).toBeLessThan(3);
  expect(samples.at(-1).gpu).toBe(samples[0].gpu);
});
