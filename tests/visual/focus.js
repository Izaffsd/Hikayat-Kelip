/**
 * Makes the page behave as if it always has focus (Chrome DevTools Protocol focus emulation). Headed test
 * browsers share the desktop with other windows; an OS focus change fires `blur`, and the game correctly
 * releases all held keys on blur — which would cut a held jump in the middle of a measurement.
 * @param {import('@playwright/test').Page} page
 */
export async function keepFocused(page) {
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Emulation.setFocusEmulationEnabled', { enabled: true });
}
