import { test } from 'node:test';
import assert from 'node:assert/strict';
import { launchBrowser } from '../lib/browser.js';

test('launchBrowser: launches Chrome if available', async () => {
  const calledArgs = [];
  const mockBrowser = { close: () => Promise.resolve() };
  
  const mockLaunch = async (options) => {
    calledArgs.push(options);
    if (options.channel === 'chrome') {
      return mockBrowser;
    }
    throw new Error('Not available');
  };

  const browser = await launchBrowser({ launch: mockLaunch });
  assert.equal(browser, mockBrowser);
  assert.deepEqual(calledArgs, [
    { headless: true, channel: 'chrome' }
  ]);
});

test('launchBrowser: falls back to Edge if Chrome is missing', async () => {
  const calledArgs = [];
  const mockBrowser = { close: () => Promise.resolve() };
  
  const mockLaunch = async (options) => {
    calledArgs.push(options);
    if (options.channel === 'msedge') {
      return mockBrowser;
    }
    throw new Error('Not available');
  };

  const browser = await launchBrowser({ launch: mockLaunch });
  assert.equal(browser, mockBrowser);
  assert.deepEqual(calledArgs, [
    { headless: true, channel: 'chrome' },
    { headless: true, channel: 'msedge' }
  ]);
});

test('launchBrowser: falls back to default cached browser if both Chrome and Edge are missing', async () => {
  const calledArgs = [];
  const mockBrowser = { close: () => Promise.resolve() };
  
  const mockLaunch = async (options) => {
    calledArgs.push(options);
    if (options.channel === undefined) {
      return mockBrowser;
    }
    throw new Error('Not available');
  };

  const browser = await launchBrowser({ launch: mockLaunch });
  assert.equal(browser, mockBrowser);
  assert.deepEqual(calledArgs, [
    { headless: true, channel: 'chrome' },
    { headless: true, channel: 'msedge' },
    { headless: true }
  ]);
});

test('launchBrowser: throws helpful error message if all options fail', async () => {
  const mockLaunch = async () => {
    throw new Error('Launcher failed');
  };

  await assert.rejects(
    () => launchBrowser({ launch: mockLaunch }),
    (err) => {
      assert.match(err.message, /No system browser \(Google Chrome or Microsoft Edge\) was found/);
      assert.match(err.message, /npx playwright install chromium --only-shell/);
      assert.match(err.message, /Launcher failed/);
      return true;
    }
  );
});
