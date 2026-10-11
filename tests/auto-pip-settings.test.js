import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { autoPipSite, openAutoPipSiteSettings } from '../src/shared/auto-pip-settings.js';

test('site permission links use only the HTTPS origin, including ports and pending navigation', () => {
  const site = autoPipSite({ url: 'https://user:secret@example.test:8443/video?token=private#time' });
  assert.equal(site.host, 'example.test:8443');
  assert.equal(site.settingsUrl, 'chrome://settings/content/siteDetails?site=https%3A%2F%2Fexample.test%3A8443');
  assert.equal(autoPipSite({ url: 'https://old.test', pendingUrl: 'https://new.test/player' }).host, 'new.test');
  for (const url of ['chrome://settings', 'http://example.test', 'file:///video', 'about:blank', 'invalid']) {
    assert.equal(autoPipSite({ url }), null);
  }
});

test('click resolves the current source in the sidebar window and preserves the video tab', async () => {
  const calls = [];
  let active = { url: 'https://first.test', index: 2 };
  const browser = { tabs: {
    async query(options) { calls.push(options); return [active]; },
    async create(options) { calls.push(options); }
  } };
  active = { url: 'https://current.test/watch', index: 5 };
  await openAutoPipSiteSettings(7, browser);
  assert.deepEqual(calls, [
    { active: true, windowId: 7 },
    { url: 'chrome://settings/content/siteDetails?site=https%3A%2F%2Fcurrent.test', windowId: 7, index: 6 }
  ]);
  active = { url: 'chrome://settings' };
  await assert.rejects(openAutoPipSiteSettings(7, browser), /HTTPS video page/);
  assert.equal(calls.length, 3, 'no settings tab created for a protected source');
});

test('sleeping overlays do no reads, and stale tab queries cannot restore a previous site', async () => {
  const handlers = {}, queries = [];
  let active = false;
  const button = { hidden: true, setAttribute() {}, addEventListener() {} };
  const event = key => ({ addListener: fn => { handlers[key] = fn; } });
  const chrome = {
    windows: { getCurrent: async () => ({ id: 7 }) },
    tabs: {
      query: options => new Promise((resolve, reject) => queries.push({ options, resolve, reject })),
      onActivated: event('activate'), onUpdated: event('update'), onRemoved: event('remove'), onReplaced: event('replace')
    },
    storage: { local: { get: async () => ({}) }, onChanged: event('storage') }
  };
  const source = fs.readFileSync('src/sidepanel/auto-pip-settings.js', 'utf8').replace(/^import .*;\n/gm, '');
  const context = vm.createContext({ chrome, autoPipSite, openAutoPipSiteSettings, isSidebarActive: () => active,
    document: { querySelector: () => button }, window: { addEventListener: (key, fn) => { handlers[key] = fn; } } });
  await vm.runInContext(`(async () => { ${source} })()`, context);
  assert.equal(queries.length, 0);
  active = true; handlers['arc-sidebar-activity']({ detail: { active: true } });
  handlers.activate({ windowId: 8 });
  assert.equal(queries.length, 1, 'other windows do not change the button');
  handlers.activate({ windowId: 7 });
  queries[1].resolve([{ id: 2, url: 'https://new.test' }]);
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(button.hidden, false); assert.match(button.title, /new.test/);
  queries[0].reject(new Error('Old tab closed'));
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(button.hidden, false, 'stale failures do not hide current site');
  handlers.activate({ windowId: 7 });
  active = false; handlers['arc-sidebar-activity']({ detail: { active: false } });
  queries[2].resolve([{ id: 3, url: 'https://other.test' }]);
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(button.hidden, true, 'sleeping overlay cannot reappear after an in-flight read');
});
