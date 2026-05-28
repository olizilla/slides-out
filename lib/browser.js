import { chromium } from 'playwright-core';

/**
 * Launches a browser instance using playwright-core.
 * Attempts to launch system Google Chrome or Microsoft Edge first to ensure
 * a zero-setup experience. If missing, attempts to launch default cached
 * Chromium. If all launch attempts fail, throws a clean instruction error.
 * 
 * Supports dependency injection via options for unit testing.
 */
export async function launchBrowser(options = {}) {
  const launchFn = options.launch || chromium.launch.bind(chromium);
  const systemChannels = options.channels || ['chrome', 'msedge'];

  // 1. Try launching using system-installed browsers
  for (const channel of systemChannels) {
    try {
      return await launchFn({ headless: true, channel });
    } catch {
      // Continue to next channel
    }
  }

  // 2. Try launching without a channel (using Playwright's cached Chromium if it exists)
  try {
    return await launchFn({ headless: true });
  } catch (err) {
    // 3. Fallback: Fail with a clear installation recommendation
    throw new Error(
      `No system browser (Google Chrome or Microsoft Edge) was found.\n\n` +
      `To run slides-out, please install Chrome/Edge, or download the Playwright headless shell by running:\n` +
      `    npx playwright install chromium --only-shell\n\n` +
      `Details: ${err.message}`
    );
  }
}
