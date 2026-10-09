import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { sidebarPreferences } from '../src/shared/sidebar-preferences.js';
function setup(failClose = false) {
  let listener; const calls = [];
  const chrome = { runtime: { id: 'test', getURL: p => `chrome-extension://test/${p}`, onMessage: { addListener: fn => { listener = fn; } } }, storage: { local: { get: async () => ({ arcSidebarAutohideTimeout: 1000 }) } }, sidePanel: { open: options => { calls.push(['open', options.windowId]); return Promise.resolve(); }, close: options => { calls.push(['close', options.windowId]); return failClose ? Promise.reject(new Error('Close failed')) : Promise.resolve(); } }, tabs: { query: async () => [{ id: 7 }], sendMessage: async (id, message) => calls.push(['message', id, message.type]) } };
  const source = fs.readFileSync('src/background/sidebar-mode.js', 'utf8').replace(/^import .*;\n/gm, '');
  vm.runInNewContext(source, { chrome, sidebarPreferences, commitStorage() {}, createStorageClient: () => ({ local: { set: async values => calls.push(['set', values.arcSidebarMode, values.arcSidebarAutohideTimeout]) } }) });
  const sender = { id: 'test', url: 'chrome-extension://test/src/sidepanel/index.html', tab: { id: 7, windowId: 2 } };
  return { calls, sender, listener, send: mode => new Promise(resolve => listener({ type: 'arc-sidebar-switch-mode', mode, windowId: 2 }, sender, resolve)) };
}
test('switch opens fixed panel synchronously from click, remembers timeout and refreshes only active tab without reload', async () => {
  const s = setup(); const pending = s.send('native');
  assert.deepEqual(s.calls, [['open', 2]]);
  assert.equal((await pending).ok, true);
  assert.deepEqual(s.calls.slice(1), [['set', 'native', 1000], ['message', 7, 'arc-sidebar-refresh-mode']]);
  assert.equal((await s.send('overlay')).ok, true);
  assert.deepEqual(s.calls.slice(3), [['close', 2], ['set', 'overlay', 1000], ['message', 7, 'arc-sidebar-refresh-mode']]);
});
test('failed panel transition does not persist mode; untrusted senders cannot switch mode', async () => {
  const s = setup(true); assert.equal((await s.send('overlay')).ok, false);
  assert.deepEqual(s.calls, [['close', 2]]);
  let response; s.listener({ type: 'arc-sidebar-switch-mode', mode: 'native' }, { ...s.sender, id: 'other' }, value => { response = value; });
  assert.equal(response.ok, false); assert.equal(s.calls.length, 1);
});
