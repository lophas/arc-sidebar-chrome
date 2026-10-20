import test from 'node:test';
import assert from 'node:assert/strict';
import { discardMinutes, discardExceptions, excludedWebsite, discardCandidate } from '../src/shared/auto-discard.js';
import { createDiscardController, DISCARD_ALARM, DISCARD_IDLE_KEY } from '../src/background/discard-controller.js';
const MINUTE = 60000;
function fixture(values = [{ id: 1, active: true }, { id: 2, active: false }]) {
  let time = 1000000;
  const tabs = new Map(values.map(tab => [tab.id, { windowId: 7, url: `https://tab${tab.id}.test/`, status: 'complete', autoDiscardable: true, ...tab }]));
  const local = { arcSidebarAutoDiscardMinutes: 5, arcSidebarModel: { favorites: [], spaces: [{ id: 'work' }] } }, session = {}, alarms = new Map();
  const discarded = [], probes = [], protections = new Map();
  const area = data => ({ get: async keys => structuredClone(Object.fromEntries((Array.isArray(keys) ? keys : [keys]).filter(key => key in data).map(key => [key, data[key]]))), set: async values => Object.assign(data, structuredClone(values)) });
  const api = {
    runtime: { getURL: path => 'chrome-extension://fixture/' + path },
    storage: { local: area(local), session: area(session) },
    tabs: { query: async () => structuredClone([...tabs.values()]), get: async id => { if (!tabs.has(id)) throw Error('Closed'); return structuredClone(tabs.get(id)); },
      discard: async id => { const tab = tabs.get(id); if (tab.active) throw Error('Active'); tab.discarded = true; discarded.push(id); return structuredClone(tab); } },
    alarms: { get: async name => alarms.get(name), clear: async name => alarms.delete(name), create: async (name, info) => alarms.set(name, { scheduledTime: info.when }) },
    scripting: { executeScript: async ({ target }) => { probes.push(target.tabId); const result = protections.get(target.tabId); if (result instanceof Error) throw result; return [{ frameId: 0, result: result || { safe: true } }]; } }
  };
  return { api, local, session, tabs, alarms, discarded, probes, protections, advance: ms => time += ms, now: () => time, controller: () => createDiscardController(api, () => time) };
}
test('exact slider values, safe defaults and hostname exception boundaries', () => {
  for (let value = 0; value <= 120; value += 5) assert.equal(discardMinutes(value), value);
  for (const value of [undefined, null, false, true, '', -5, 7, 125, Infinity]) assert.equal(discardMinutes(value), 30);
  assert.deepEqual(discardExceptions(['HTTPS://Example.COM/path', '*.example.com', 'localhost:8000']), ['example.com', 'localhost']);
  assert.equal(excludedWebsite('https://mail.example.com/', ['example.com']), true);
  assert.equal(excludedWebsite('https://fakeexample.com/', ['example.com']), false);
  for (const input of [['chrome://settings'], ['javascript:alert(1)'], ['https://user:pass@example.com'], [null]]) assert.throws(() => discardExceptions(input));
});
test('active tabs in every window, native pinned tabs, sound, loading and manual protection are never discarded', async () => {
  const f = fixture([{ id: 1, active: true }, { id: 2, active: false }, { id: 3, active: true, windowId: 8 }, { id: 4, pinned: true },
    { id: 5, audible: true }, { id: 6, autoDiscardable: false }, { id: 7, discarded: true }, { id: 8, status: 'loading' },
    { id: 9, url: 'chrome://extensions/' }, { id: 10, url: 'https://protected.test/' }]);
  f.local.arcSidebarAutoDiscardExceptions = ['protected.test'];
  const controller = f.controller(); await controller.start(); f.advance(5 * MINUTE); await controller.alarm();
  assert.deepEqual(f.discarded, [2]); assert.deepEqual(f.probes, [2]);
  assert.equal(f.local.arcSidebarModel.spaces[0].id, 'work');
});
test('leaving a long-used tab starts a fresh full idle period; restart preserves that deadline', async () => {
  const f = fixture(); let controller = f.controller(); await controller.start();
  f.advance(4 * 60 * MINUTE); f.tabs.get(1).active = false; f.tabs.get(2).active = true;
  await controller.activated({ tabId: 2, windowId: 7 });
  assert.equal(f.session[DISCARD_IDLE_KEY][1].since, f.now());
  f.advance(4 * MINUTE); controller = f.controller(); await controller.start(); await controller.alarm(); assert.deepEqual(f.discarded, []);
  f.advance(MINUTE); await controller.alarm(); assert.deepEqual(f.discarded, [1]);
});
test('disable clears the only alarm; re-enabling starts a fresh idle period', async () => {
  const f = fixture(), controller = f.controller(); await controller.start(); assert.equal(f.alarms.size, 1);
  f.local.arcSidebarAutoDiscardMinutes = 0; await controller.configure(); assert.equal(f.alarms.size, 0);
  f.advance(120 * MINUTE); await controller.alarm(); assert.deepEqual(f.discarded, []);
  f.local.arcSidebarAutoDiscardMinutes = 30; await controller.configure();
  assert.equal(f.alarms.get(DISCARD_ALARM).scheduledTime, f.now() + 30 * MINUTE);
});
test('media, capture, unsaved edits and unknown pages remain open; failures cannot cause a tight wake loop', async () => {
  const f = fixture([{ id: 1, active: true }, ...[2, 3, 4, 5, 6].map(id => ({ id }))]);
  for (const [id, reason] of [[2, 'media'], [3, 'pip'], [4, 'capture'], [5, 'editing'], [6, 'unverified']]) f.protections.set(id, { safe: false, reason });
  const controller = f.controller(); await controller.start(); f.advance(5 * MINUTE); await controller.alarm();
  assert.deepEqual(f.discarded, []); assert.equal(f.session[DISCARD_IDLE_KEY][6].blocked, true);
  assert.equal(f.alarms.get(DISCARD_ALARM).scheduledTime, f.now() + 5 * MINUTE);
  f.protections.delete(2); f.advance(5 * MINUTE); await controller.alarm(); assert.deepEqual(f.discarded, [2]);
  assert.equal(f.probes.filter(id => id === 6).length, 1, 'Unknown documents wait for navigation instead of repeated probing');
});
test('activation, navigation, protection and disabling during a safety probe prevent discard', async () => {
  for (const change of ['active', 'url', 'protected', 'disabled']) {
    const f = fixture(), controller = f.controller(); await controller.start(); f.advance(5 * MINUTE);
    f.api.scripting.executeScript = async () => {
      if (change === 'active') f.tabs.get(2).active = true;
      if (change === 'url') f.tabs.get(2).url = 'https://new.test/';
      if (change === 'protected') f.tabs.get(2).autoDiscardable = false;
      if (change === 'disabled') f.local.arcSidebarAutoDiscardMinutes = 0;
      return [{ result: { safe: true } }];
    };
    await controller.alarm(); assert.deepEqual(f.discarded, [], change);
  }
});
test('one alarm spreads large discard batches and isolated page failures do not stop the rest', async () => {
  const f = fixture([{ id: 1, active: true }, ...Array.from({ length: 25 }, (_, index) => ({ id: index + 2 }))]);
  f.protections.set(2, Error('Cannot script this tab'));
  const controller = f.controller(); await controller.start(); f.advance(5 * MINUTE); await controller.alarm();
  assert.equal(f.probes.length, 10); assert.equal(f.discarded.length, 9); assert.equal(f.alarms.size, 1);
  assert.equal(f.alarms.get(DISCARD_ALARM).scheduledTime, f.now() + 30000);
  f.advance(30000); await controller.alarm(); assert.equal(f.discarded.length, 19);
});
test('refreshing a previously unknown page restores eligibility and closing it removes its idle state', async () => {
  const f = fixture(), controller = f.controller(); await controller.start(); f.protections.set(2, { safe: false, reason: 'unverified' });
  f.advance(5 * MINUTE); await controller.alarm(); assert.equal(f.alarms.size, 0);
  await controller.updated(2, { status: 'loading' }, { ...f.tabs.get(2), status: 'loading' });
  f.protections.delete(2); await controller.updated(2, { status: 'complete' }, f.tabs.get(2));
  f.advance(5 * MINUTE); await controller.alarm(); assert.deepEqual(f.discarded, [2]);
  f.tabs.delete(2); await controller.removed(2); assert.equal(f.session[DISCARD_IDLE_KEY][2], undefined);
});
test('candidate filtering does not confuse saved sidebar links with native Chrome pinned tabs', () => {
  assert.equal(discardCandidate({ id: 1, active: false, url: 'https://saved.test/', pinned: false }), true);
  assert.equal(discardCandidate({ id: 1, active: false, url: 'https://saved.test/', pinned: true }), false);
});
