/**
 * Starts the test Chrome once and leaves it open: headed, WebGPU enabled, remote debugging on a fixed port, its
 * profile on drive D: (D-008). The visual tests (tests/visual/fixtures.js) connect to it and run each test in a new
 * tab, instead of launching and closing a Chrome window for every run and test (D-035). Does nothing when it is
 * already running. Close the window to stop it.
 *
 * Usage: `npm run chrome:test`
 */
import { spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';

const TEST_CHROME_PORT = Number(process.env.HK_CHROME_PORT ?? 9333);
const ENDPOINT = `http://127.0.0.1:${TEST_CHROME_PORT}`;
const CHROME = process.env.CHROME_PATH ?? 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const PROFILE = process.env.HK_CHROME_PROFILE ?? 'D:\\dev\\.cache\\chrome-test';

async function running() {
  try {
    const response = await fetch(`${ENDPOINT}/json/version`);
    return response.ok;
  } catch {
    return false;
  }
}

if (await running()) {
  console.info(`Test Chrome is already running at ${ENDPOINT}`);
} else {
  mkdirSync(PROFILE, { recursive: true });
  const child = spawn(
    CHROME,
    [
      `--remote-debugging-port=${TEST_CHROME_PORT}`,
      `--user-data-dir=${PROFILE}`,
      '--enable-unsafe-webgpu',
      '--autoplay-policy=no-user-gesture-required',
      // Keep rendering at full rate when the window is covered by other windows (what Playwright's own launch does).
      '--disable-background-timer-throttling',
      '--disable-backgrounding-occluded-windows',
      '--disable-renderer-backgrounding',
      '--no-first-run',
      '--no-default-browser-check',
      '--window-size=1320,860',
      'about:blank',
    ],
    { detached: true, stdio: 'ignore' },
  );
  child.unref();
  const deadline = Date.now() + 20_000;
  while (!(await running())) {
    if (Date.now() > deadline) {
      console.error(`Test Chrome did not open its debugging port ${TEST_CHROME_PORT} within 20 s`);
      process.exit(1);
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  console.info(`Test Chrome is running at ${ENDPOINT} (profile ${PROFILE})`);
}
