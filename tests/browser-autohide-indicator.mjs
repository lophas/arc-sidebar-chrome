import assert from 'node:assert/strict';
import { cp, mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createServer } from 'node:http';
import { chromium } from 'playwright-core';

const directory = await mkdtemp(join(tmpdir(), 'arc-toolbar-extension-'));
const server = createServer((req, res) => { res.setHeader('Content-Type', 'text/html'); res.end('<!doctype html><title>Toolbar test</title>'); });
await new Promise(done => server.listen(0, '127.0.0.1', done));
let context;
try {
  await cp('src', join(directory, 'src'), { recursive: true });
  await cp('manifest.json', join(directory, 'manifest.json'));
  context = await chromium.launchPersistentContext('', { channel: 'chromium', headless: false, ignoreDefaultArgs: ['--disable-extensions'], args: ['--no-sandbox', `--disable-extensions-except=${directory}`, `--load-extension=${directory}`] });
  let [worker] = context.serviceWorkers();
  if (!worker) worker = await context.waitForEvent('serviceworker');
  const controls = await context.newPage();
  await controls.goto(`chrome-extension://${worker.url().split('/')[2]}/src/options/index.html`);
  // Exercise the real service-worker-compatible canvas and action.setIcon API.
  await controls.evaluate(async () => { const { enlargeToolbarIcon } = await import('../background/toolbar-icon.js'); await enlargeToolbarIcon(); });
  const ids = await worker.evaluate(async origin => {
    await chrome.storage.local.set({ arcSidebarMode: 'overlay', arcSidebarAutohideTimeout: 800 });
    const protectedTab = await chrome.tabs.create({ url: 'chrome://version/', active: false });
    const regularTab = await chrome.tabs.create({ url: origin, active: true });
    return { protected: protectedTab.id, regular: regularTab.id };
  }, `http://127.0.0.1:${server.address().port}/`);
  const poll = async (id, text) => {
    for (let i = 0; i < 100; i++) {
      if (await worker.evaluate(async ({ id, text }) => (await chrome.action.getBadgeText({ tabId: id })) === text, { id, text })) return;
      await new Promise(done => setTimeout(done, 50));
    }
    assert.fail(`Tab ${id} did not receive toolbar badge ${JSON.stringify(text)}`);
  };
  await poll(ids.protected, '!'); await poll(ids.regular, '');
  assert.match(await worker.evaluate(id => chrome.action.getTitle({ tabId: id }), ids.protected), /Click to open the fixed sidebar/);
  assert.deepEqual(await worker.evaluate(id => chrome.action.getBadgeBackgroundColor({ tabId: id }), ids.protected), [251, 191, 36, 255]);
  await worker.evaluate(() => chrome.storage.local.set({ arcSidebarMode: 'native' }));
  await poll(ids.protected, '');
  assert.equal(await worker.evaluate(id => chrome.action.getTitle({ tabId: id }), ids.protected), 'Open Arc Side of the Chrome');
  await worker.evaluate(() => chrome.storage.local.set({ arcSidebarMode: 'overlay' }));
  await poll(ids.protected, '!');
  await worker.evaluate(({ id, url }) => chrome.tabs.update(id, { url }), { id: ids.protected, url: `http://127.0.0.1:${server.address().port}/ordinary` });
  await poll(ids.protected, '');
  console.log('PASS real Chrome toolbar: larger icon renders, protected-page badge is yellow and tab-specific, Fixed clears inactive tabs and ordinary navigation restores the tooltip');
} finally {
  await context?.close();
  await new Promise(done => server.close(done));
  await rm(directory, { recursive: true, force: true });
}
