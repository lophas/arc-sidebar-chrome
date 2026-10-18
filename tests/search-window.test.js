import test from 'node:test';
import assert from 'node:assert/strict';
import { createSearchWindowController } from '../src/background/search-window.js';

function fixture() {
  const source = { id: 7, type: 'normal', width: 1200, height: 900, left: 10, top: 20 };
  const windows = [], calls = [];
  const url = 'chrome-extension://test/src/sidepanel/command.html';
  const api = {
    runtime: { getURL: () => url },
    windows: {
      getAll: async () => structuredClone(windows),
      get: async id => id === 7 ? source : { id, type: 'popup' },
      getLastFocused: async () => source,
      create: async options => {
        calls.push(['create', options]);
        const window = { id: 100 + windows.length, state: 'normal', tabs: [{ pendingUrl: options.url }] };
        windows.push(window); return window;
      },
      update: async (id, options) => { calls.push(['update', id, options]); return windows.find(window => window.id === id); },
      remove: async id => { calls.push(['remove', id]); windows.splice(windows.findIndex(window => window.id === id), 1); }
    },
    tabs: { query: async () => [{ id: 42 }] }
  };
  return { api, windows, calls, url };
}

test('rapid shortcut presses create one window, including while its URL is pending', async () => {
  const f = fixture(), open = createSearchWindowController(f.api);
  await Promise.all([open({ id: 42, windowId: 7 }), open(), open({ id: 99, windowId: 8 })]);
  assert.equal(f.windows.length, 1);
  assert.equal(f.calls.filter(call => call[0] === 'create').length, 1);
  assert.equal(f.calls.filter(call => call[0] === 'update').length, 2);
  assert.equal(new URL(f.windows[0].tabs[0].pendingUrl).searchParams.get('sourceTabId'), '42');
});

test('a restarted controller discovers and restores the existing window without changing its contents', async () => {
  const f = fixture();
  f.windows.push({ id: 88, state: 'minimized', tabs: [{ url: f.url + '?windowId=7&sourceTabId=42' }] });
  await createSearchWindowController(f.api)({ id: 99, windowId: 8 });
  assert.deepEqual(f.calls, [['update', 88, { focused: true, state: 'normal' }]]);
  assert.equal(f.windows[0].tabs[0].url, f.url + '?windowId=7&sourceTabId=42');
});

test('clean up legacy duplicates while preserving the focused search and unrelated popups', async () => {
  const f = fixture();
  f.windows.push({ id: 88, tabs: [{ url: f.url }] }, { id: 89, focused: true, tabs: [{ url: f.url + '?windowId=7' }] },
    { id: 90, tabs: [{ url: 'chrome-extension://other/src/sidepanel/command.html' }] });
  await createSearchWindowController(f.api)();
  assert.deepEqual(f.calls, [['remove', 88], ['update', 89, { focused: true }]]);
  assert.deepEqual(f.windows.map(window => window.id), [89, 90]);
});

test('a window closed during focus is replaced using a normal source window', async () => {
  const f = fixture();
  f.windows.push({ id: 88, tabs: [{ url: f.url }] });
  f.api.windows.update = async () => { f.windows.length = 0; throw Error('Window closed'); };
  await createSearchWindowController(f.api)({ id: 101, windowId: 88 });
  assert.equal(f.calls[0][0], 'create');
  const url = new URL(f.calls[0][1].url);
  assert.equal(url.searchParams.get('windowId'), '7');
  assert.equal(url.searchParams.get('sourceTabId'), '42');
});

test('a failed opening does not disable the next shortcut', async () => {
  const f = fixture(), open = createSearchWindowController(f.api);
  const create = f.api.windows.create;
  f.api.windows.create = async () => { throw Error('Temporary failure'); };
  await assert.rejects(open(), /Temporary failure/);
  f.api.windows.create = create;
  await open();
  assert.equal(f.windows.length, 1);
});
