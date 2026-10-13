import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { resolve, extname } from 'node:path';
import { chromium } from 'playwright-core';
const root = process.cwd();
const server = createServer(async (req, res) => {
  const pathname = new URL(req.url, 'http://localhost').pathname;
  if (pathname === '/src/sidepanel/search-test.html') {
    res.setHeader('Content-Type', 'text/html');
    res.end('<!doctype html><link rel="stylesheet" href="styles.css"><button id="openCommandBar">Search</button><script type="module" src="command-bar.js"></script>'); return;
  }
  const file = resolve(root, '.' + pathname);
  if (!file.startsWith(root + '/')) { res.writeHead(403); res.end(); return; }
  try { res.setHeader('Content-Type', { '.js': 'text/javascript', '.html': 'text/html', '.css': 'text/css' }[extname(file)] || 'application/octet-stream'); res.end(await readFile(file)); }
  catch { res.writeHead(404); res.end(); }
});
await new Promise(done => server.listen(0, '127.0.0.1', done));
const browser = await chromium.launch({ executablePath: process.env.ASOTC_CHROME_BINARY || '/usr/bin/google-chrome', headless: true, args: ['--no-sandbox'] });
try {
  const context = await browser.newContext();
  await context.addInitScript(() => {
    const event = () => { const listeners = []; return { addListener: fn => listeners.push(fn), emit: (...args) => listeners.forEach(fn => fn(...args)) }; };
    const data = { arcSidebarModel: { favorites: [{ id: 'fav', type: 'tab', title: 'Mail', url: 'https://mail.test' }], spaces: [{ id: 'work', title: 'Work', children: [{ id: 'folder', type: 'folder', title: 'Research', children: [{ id: 'pin', type: 'tab', title: 'Original saved page', url: 'https://original.test' }, { id: 'closed', type: 'tab', title: 'Closed saved link', url: 'https://closed.test' }] }] }] }, arcSidebarBindings: { pin: 1, fav: 4 } };
    const tabs = [{ id: 1, windowId: 1, groupId: 9, active: true, url: 'https://navigated.test', title: 'Current pinned page', lastAccessed: 400 }, { id: 2, windowId: 1, groupId: -1, active: false, url: 'https://free.test', title: 'Previous ungrouped tab', lastAccessed: 300 }, { id: 3, windowId: 1, groupId: -1, url: 'chrome://extensions/', title: 'Extensions', lastAccessed: 200 }, { id: 4, windowId: 2, groupId: 10, active: true, url: 'https://mail.test', title: 'Inbox', lastAccessed: 100 }, { id: 5, windowId: 1, groupId: -1, url: 'chrome://newtab/', title: 'New Tab', lastAccessed: 500 }, { id: 6, windowId: 1, groupId: -1, url: 'https://readonly.test', title: 'Chrome pinned', pinned: true, lastAccessed: 600 }];
    let gate = null, release, clock = 1000;
    const get = async keys => { await gate; return structuredClone(Object.fromEntries((Array.isArray(keys) ? keys : [keys]).filter(key => key in data).map(key => [key, data[key]]))); };
    const fixture = window.fixture = { data, tabs, calls: [], hold() { gate = new Promise(done => release = done); }, release() { gate = null; release(); }, closed: 0 };
    window.close = () => fixture.closed++;
    const chrome = window.chrome = { storage: { local: { get }, session: { get }, onChanged: event() },
      tabs: { query: async query => structuredClone(tabs.filter(tab => (query.windowId == null || tab.windowId === query.windowId) && (!query.active || tab.active))), onCreated: event(), onRemoved: event(), onUpdated: event(), onActivated: event() },
      tabGroups: { query: async () => [{ id: 9, title: 'Work' }, { id: 10, title: 'Favorites' }], onCreated: event(), onRemoved: event(), onUpdated: event() },
      windows: { getCurrent: async () => ({ id: location.pathname.endsWith('command.html') ? 99 : 1 }) },
      sidePanel: { open: async options => fixture.calls.push({ type: 'sidePanel', ...options }) },
      runtime: { id: 'fixture', sendMessage: async message => { fixture.calls.push(message); if (message.item?.kind === 'Open tab') { const target = tabs.find(tab => tab.id === message.item.tabId); for (const tab of tabs) if (tab.windowId === target.windowId) tab.active = tab.id === target.id; target.lastAccessed = ++clock; chrome.tabs.onActivated.emit({ tabId: target.id, windowId: target.windowId }); } return { ok: true }; } } };
  });
  const page = await context.newPage(); const errors = []; page.on('pageerror', e => errors.push(e.message));
  const base = `http://127.0.0.1:${server.address().port}/src/sidepanel/`;
  await page.goto(base + 'search-test.html');
  const rows = page.locator('.command-result'), input = page.locator('.command-input');
  await page.locator('#openCommandBar').click();
  await rows.first().waitFor();
  assert.deepEqual(await rows.locator('strong').allTextContents(), ['Previous ungrouped tab', 'Extensions', 'Inbox']);
  assert.ok((await rows.first().textContent()).includes('Ungrouped'));
  await input.fill('Original saved page');
  assert.equal(await rows.count(), 2); // one bound tab and Google
  assert.ok((await rows.first().textContent()).includes('Work / Research'));
  await input.press('Escape');
  // Clear old results and wait for asynchronous storage, even for immediate Enter.
  await page.evaluate(() => fixture.hold());
  await page.keyboard.press('Control+k');
  assert.equal(await rows.count(), 0);
  await input.press('Enter');
  await page.evaluate(() => fixture.release());
  await page.waitForFunction(() => fixture.calls.at(-1)?.item?.tabId === 2 && !document.querySelector('dialog').open);
  await page.evaluate(() => fixture.hold());
  await page.keyboard.press('Control+k'); await input.press('Enter');
  await page.evaluate(() => fixture.release());
  await page.waitForFunction(() => fixture.calls.at(-1)?.item?.tabId === 1 && !document.querySelector('dialog').open);
  await page.evaluate(() => fixture.hold());
  await page.keyboard.press('Control+k'); await input.press('Enter'); await input.press('Escape');
  await page.evaluate(() => fixture.release());
  await page.waitForTimeout(100);
  assert.equal(await page.evaluate(() => fixture.calls.length), 2, 'Escape cancels a queued Enter without activating a tab');
  console.log('PASS real Chrome: shared search Cmd+K → Enter toggles between a pinned and ungrouped tab, including delayed data');
  await page.keyboard.press('Control+k'); await rows.first().waitFor();
  await input.fill('chrome://extensions');
  assert.equal(await rows.first().locator('strong').textContent(), 'Extensions');
  assert.equal(await rows.filter({ hasText: 'Open chrome://' }).count(), 0);
  await input.press('Enter');
  await page.waitForFunction(() => fixture.calls.at(-1)?.item?.tabId === 3 && !document.querySelector('dialog').open);
  assert.equal(await page.evaluate(() => fixture.calls.at(-1).windowId), 1);
  await page.keyboard.press('Control+k'); await rows.first().waitFor();
  await input.fill('Closed saved link'); await input.press('Enter');
  await page.waitForFunction(() => fixture.calls.at(-1)?.item?.kind === 'Pinned');
  console.log('PASS real Chrome: internal Chrome tab activation, bound-link deduplication and closed saved links');
  // The standalone window keeps its original source tab/window instead of its own popup.
  await page.goto(base + 'command.html?windowId=1&sourceTabId=1');
  await rows.first().waitFor();
  assert.equal(await rows.first().locator('strong').textContent(), 'Previous ungrouped tab');
  await input.press('Enter');
  await page.waitForFunction(() => fixture.closed === 1);
  assert.equal(await page.evaluate(() => fixture.calls.at(-1).windowId), 1);
  assert.equal(await page.evaluate(() => fixture.calls.at(-1).item.tabId), 2);
  assert.deepEqual(errors, []);
  console.log('PASS real Chrome: standalone Cmd+K popup uses captured source and activates the existing tab in the source window');
} finally { await browser.close(); await new Promise(done => server.close(done)); }
