import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const KEY = 'arcSidebarSyncedEdgeTrigger';
function fixture({ local = {}, cloud, enabled = true } = {}) {
  const data = { local: structuredClone(local), sync: { arcSidebarSyncEnabled: enabled, arcSidebarSyncMeta: { chunks: 1 }, ...(cloud === undefined ? {} : { [KEY]: cloud }) } };
  const events = { startup: [], installed: [] }, listeners = [], writes = [];
  const emit = (changes, name) => listeners.forEach(fn => fn(changes, name));
  const area = name => ({
    async get(key) { return structuredClone(Object.fromEntries((Array.isArray(key) ? key : [key]).filter(k => k in data[name]).map(k => [k, data[name][k]]))); },
    async set(values) { const changes = {}; for (const [key, value] of Object.entries(values)) { changes[key] = { oldValue: data[name][key], newValue: value }; data[name][key] = structuredClone(value); } writes.push({ area: name, action: 'set' }); emit(changes, name); },
    async remove(key) { const changes = { [key]: { oldValue: data[name][key] } }; delete data[name][key]; writes.push({ area: name, action: 'remove' }); emit(changes, name); }
  });
  const chrome = { storage: { local: area('local'), sync: area('sync'), onChanged: { addListener: fn => listeners.push(fn) } }, runtime: { onStartup: { addListener: fn => events.startup.push(fn) }, onInstalled: { addListener: fn => events.installed.push(fn) } } };
  vm.runInNewContext(fs.readFileSync('src/background/trigger-sync.js', 'utf8').replace(/export /g, ''), { chrome, console });
  const drain = async () => { for (let i = 0; i < 8; i++) await Promise.resolve(); };
  return { data, chrome, writes, drain, events };
}
const local = { arcSidebarEdgeTrigger: { height: 35, offset: 60, width: 12 }, arcSidebarMode: 'native', arcSidebarAutohideTimeout: 400, arcSidebarFavoriteSizePercent: 150 };
test('upgrade removes legacy cloud geometry while preserving every local preference and workspace metadata', async () => {
  for (const enabled of [true, false]) for (const preferences of [{}, local]) {
    const f = fixture({ local: preferences, cloud: { height: 100, offset: 0, width: 16 }, enabled });
    await f.drain();
    assert.deepEqual(f.data.local, preferences);
    assert.equal(Object.hasOwn(f.data.sync, KEY), false);
    assert.deepEqual(f.data.sync.arcSidebarSyncMeta, { chunks: 1 });
    assert.equal(f.data.sync.arcSidebarSyncEnabled, enabled);
    assert.deepEqual(f.writes, [{ area: 'sync', action: 'remove' }]);
  }
});
test('mode, timeout, trigger and Favorite size edits stay local even with Sync enabled', async () => {
  const f = fixture(); await f.drain(); const cloud = structuredClone(f.data.sync);
  await f.chrome.storage.local.set(local); await f.drain();
  assert.deepEqual(f.data.local, local); assert.deepEqual(f.data.sync, cloud);
  assert.equal(f.writes.some(write => write.area === 'sync'), false);
});
test('legacy settings written by an older device never override this device', async () => {
  const f = fixture({ local }); await f.drain();
  await f.chrome.storage.sync.set({ [KEY]: { height: 20, offset: 80, width: 22 } }); await f.drain();
  assert.deepEqual(f.data.local, local); assert.equal(Object.hasOwn(f.data.sync, KEY), true);
  assert.equal(f.writes.filter(write=>write.action==='remove').length,0,'Ignore legacy cloud changes without an echo loop');
  for (const event of ['startup', 'installed']) { f.data.sync[KEY] = null; await Promise.all(f.events[event].map(fn => fn())); assert.equal(Object.hasOwn(f.data.sync, KEY), false); }
  assert.deepEqual(f.data.local, local);
});
