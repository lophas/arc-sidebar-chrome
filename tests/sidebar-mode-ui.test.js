import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { sidebarPreferences } from '../src/shared/sidebar-preferences.js';

async function setup({ ok = true, embedded = true } = {}) {
  let click, changed;
  const messages = [], requests = [], settings = { arcSidebarMode: 'overlay' };
  const button = { setAttribute() {}, addEventListener(_name, fn) { click = fn; } };
  const window = {};
  window.parent = embedded ? { postMessage: message => messages.push(message.type) } : window;
  const chrome = { windows: { getCurrent: async () => ({ id: 2 }) }, storage: {
    local: { get: async () => ({ ...settings }) }, onChanged: { addListener: fn => { changed = fn; } }
  }, runtime: { sendMessage: async request => {
    requests.push(request.mode);
    if (ok) { settings.arcSidebarMode = request.mode; changed({ arcSidebarMode: {} }, 'local'); }
    await Promise.resolve();
    return { ok, error: 'Open failed' };
  } } };
  const source = fs.readFileSync('src/sidepanel/sidebar-mode.js', 'utf8').replace(/^import .*;\n/gm, '');
  await vm.runInNewContext('(async()=>{' + source + '})()', { chrome, window, document: { querySelector: () => button }, sidebarPreferences, console });
  return { click, messages, requests, button };
}

test('embedded mode button commits Fixed to its own host even when storage updates its label before the reply', async () => {
  const s = await setup(); await s.click();
  assert.deepEqual(s.requests, ['native']);
  assert.deepEqual(s.messages, ['arc-sidebar-fixed-handoff']);
  assert.equal(s.button.disabled, false);
});

test('failed transitions and a standalone native panel never send an overlay handoff', async () => {
  const failed = await setup({ ok: false }); await failed.click();
  assert.deepEqual(failed.messages, []); assert.equal(failed.button.title, 'Open failed');
  const native = await setup({ embedded: false }); await native.click();
  assert.deepEqual(native.messages, []);
});
