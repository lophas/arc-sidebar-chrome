import assert from 'node:assert/strict';
import { cp, mkdtemp, rm, readFile, writeFile } from 'node:fs/promises';
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
  const currentManifest = JSON.parse(await readFile('manifest.json', 'utf8'));
  // Start with the retired binding, then update the same installed extension.
  const previousManifest = { ...currentManifest, commands: { 'arc-command-bar-v3': {
    suggested_key: { default: 'Ctrl+K', mac: 'Command+K' }, description: 'Open search'
  } } };
  await writeFile(join(directory, 'manifest.json'), JSON.stringify(previousManifest));
  context = await chromium.launchPersistentContext('', { channel: 'chromium', headless: false, ignoreDefaultArgs: ['--disable-extensions'], args: ['--no-sandbox', '--enable-unsafe-extension-debugging', `--disable-extensions-except=${directory}`, `--load-extension=${directory}`] });
  const devtools = await context.browser().newBrowserCDPSession();
  let [worker] = context.serviceWorkers();
  if (!worker) worker = await context.waitForEvent('serviceworker');
  let controls = await context.newPage();
  await controls.goto(`chrome-extension://${worker.url().split('/')[2]}/src/options/index.html`);
  // Chrome draws the native panel header from manifest icons, not action.setIcon.
  const manifestIcons = await controls.evaluate(async () => {
    const result = [];
    for (const path of Object.values(chrome.runtime.getManifest().icons)) {
      const image = await createImageBitmap(await (await fetch(chrome.runtime.getURL(path))).blob());
      const canvas = new OffscreenCanvas(image.width, image.height), ctx = canvas.getContext('2d');
      ctx.drawImage(image, 0, 0);
      const center = ctx.getImageData(Math.floor(image.width / 2), Math.floor(image.height / 2), 1, 1).data;
      result.push({ path, alpha: center[3] }); image.close();
    }
    return result;
  });
  for (const icon of manifestIcons) assert.equal(icon.alpha, 0, `Native panel icon must have a transparent arch opening: ${icon.path}`);
  // Exercise the real service-worker-compatible canvas and action.setIcon API.
  const coverage = await controls.evaluate(async () => {
    const { enlargeToolbarIcon } = await import('../background/toolbar-icon.js');
    const icons = await enlargeToolbarIcon();
    return Object.entries(icons).map(([size, image]) => {
      const xs = [], ys = [];
      for (let i = 0; i < image.data.length; i += 4) {
        const rgb = Array.from(image.data.slice(i, i + 3));
        if (image.data[i + 3] > 128 && Math.max(...rgb) > 90 && Math.max(...rgb) - Math.min(...rgb) > 32) {
          xs.push((i / 4) % image.width); ys.push(Math.floor(i / 4 / image.width));
        }
      }
      return { centerAlpha: image.data[(Math.floor(image.height / 2) * image.width + Math.floor(image.width / 2)) * 4 + 3], size: Number(size), width: Math.max(...xs) - Math.min(...xs) + 1, height: Math.max(...ys) - Math.min(...ys) + 1 };
    });
  });
  for (const icon of coverage) {
    assert.equal(icon.centerAlpha, 0, 'The arch opening must reveal the toolbar background');
    assert.ok(icon.width >= icon.size - 2, 'Colored arch must fill the available toolbar width');
    assert.ok(icon.height >= icon.size - 2, 'Colored arch must fill the available toolbar height');
  }
  const ids = await controls.evaluate(async origin => {
    await chrome.storage.local.set({ arcSidebarMode: 'overlay', arcSidebarAutohideTimeout: 800 });
    const protectedTab = await chrome.tabs.create({ url: 'chrome://version/', active: false });
    const regularTab = await chrome.tabs.create({ url: origin, active: true });
    return { protected: protectedTab.id, regular: regularTab.id };
  }, `http://127.0.0.1:${server.address().port}/`);
  const poll = async (id, text) => {
    for (let i = 0; i < 100; i++) {
      if (await controls.evaluate(async ({ id, text }) => (await chrome.action.getBadgeText({ tabId: id })) === text, { id, text })) return;
      await new Promise(done => setTimeout(done, 50));
    }
    assert.fail(`Tab ${id} did not receive toolbar badge ${JSON.stringify(text)}`);
  };
  const reloadExtension = async () => {
    // Wait for Chrome's unpacked loader to finish reloading the same extension.
    // runtime.reload() can unload a command-line extension without reloading it.
    if (!controls.isClosed()) await controls.close();
    const { id } = await devtools.send('Extensions.loadUnpacked', { path: directory });
    assert.equal(id, worker.url().split('/')[2]);
    controls = await context.newPage();
    await controls.goto(`chrome-extension://${id}/src/options/index.html`);
    await controls.evaluate(() => chrome.runtime.sendMessage({ type: 'arc-sidebar-panel-layout' }));
  };
  await poll(ids.protected, '!'); await poll(ids.regular, '');
  // Reload with a protected tab active and another inactive. Neither gets a
  // mode change or a subsequent protected-tab activation to repair its badge.
  const secondProtected = await controls.evaluate(() => chrome.tabs.create({ url: 'chrome://extensions/', active: true }));
  await poll(secondProtected.id, '!');
  await writeFile(join(directory, 'manifest.json'), JSON.stringify(currentManifest));
  await reloadExtension();
  const commands = await controls.evaluate(() => chrome.commands.getAll());
  assert.equal(commands.find(command => command.name === 'arc-command-bar-v4')?.shortcut, 'Alt+T');
  assert.equal(commands.some(command => command.name === 'arc-command-bar-v3'), false);
  console.log('PASS real Chrome: updating the existing extension retires Ctrl+K and registers Alt+T');
  await poll(ids.protected, '!'); await poll(secondProtected.id, '!'); await poll(ids.regular, '');
  assert.equal(await controls.evaluate(async () => (await chrome.storage.local.get('arcSidebarMode')).arcSidebarMode), 'overlay');
  assert.match(await controls.evaluate(id => chrome.action.getTitle({ tabId: id }), ids.protected), /Click to open the fixed sidebar/);
  assert.deepEqual(await controls.evaluate(id => chrome.action.getBadgeBackgroundColor({ tabId: id }), ids.protected), [251, 191, 36, 255]);
  await controls.evaluate(() => chrome.storage.local.set({ arcSidebarMode: 'native' }));
  await poll(ids.protected, '');
  await reloadExtension();
  await poll(ids.protected, ''); await poll(secondProtected.id, '');
  assert.equal(await controls.evaluate(id => chrome.action.getTitle({ tabId: id }), ids.protected), 'Open Arc Side of the Chrome');
  await controls.evaluate(() => chrome.storage.local.set({ arcSidebarMode: 'overlay' }));
  await poll(ids.protected, '!');
  await controls.evaluate(({ id, url }) => chrome.tabs.update(id, { url }), { id: ids.protected, url: `http://127.0.0.1:${server.address().port}/ordinary` });
  await poll(ids.protected, '');
  console.log('PASS real Chrome toolbar: larger icon renders, active and inactive protected tabs retain yellow warnings after extension reload, Fixed stays unmarked and ordinary navigation restores the tooltip');
} finally {
  await context?.close();
  await new Promise(done => server.close(done));
  await rm(directory, { recursive: true, force: true });
}
