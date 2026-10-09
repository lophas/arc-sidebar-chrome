import test from 'node:test';
import assert from 'node:assert/strict';
import { mockChrome } from './mock-chrome.js';

const mock = mockChrome();
globalThis.chrome = mock.chrome;
const { closeWindowTabs, openSavedItem, activateTab, openUrlTab } = await import('../src/background/tab-actions.js');
const { serializeState } = await import('../src/background/state-controller.js');
const KEY = 'arcSidebarWindowPlaceholders';
async function seed() {
  await serializeState(async () => {});
  mock.tabs.clear();
  mock.tabs.set(10, { id: 10, windowId: 1, groupId: -1, url: 'https://old.test/' });
  mock.data.session = { arcSidebarBindings: {} };
  mock.data.local = { arcSidebarModel: { favorites: [{ id: 'fav', type: 'tab', url: 'https://favorite.test/' }], spaces: [{ id: 's', children: [{ id: 'folder', type: 'folder', children: [{ id: 'saved', type: 'tab', url: 'https://saved.test/' }] }] }] } };
}
async function placeholder() {
  await closeWindowTabs(1);
  await serializeState(async () => {});
  const tab = [...mock.tabs.values()].find(tab => tab.windowId === 1);
  tab.url = 'chrome://newtab/';
  return tab;
}

test('saved links and Favorites reuse only the generated placeholder, preserving its ID and creating their binding', async () => {
  for (const itemId of ['fav', 'saved']) {
    await seed(); const blank = await placeholder(); const creates = mock.counts().creates;
    const id = await openSavedItem(itemId, 1);
    await serializeState(async () => {});
    assert.equal(id, blank.id); assert.equal(mock.tabs.size, 1); assert.equal(mock.counts().creates, creates);
    assert.equal(mock.data.session.arcSidebarBindings[itemId], id);
    assert.equal(mock.tabs.get(id).url, itemId === 'fav' ? 'https://favorite.test/' : 'https://saved.test/');
    assert.deepEqual(mock.data.session[KEY], {});
    if (itemId === 'saved') { assert.equal(mock.data.local.arcSidebarState.currentSpaceId, 's'); assert.equal(mock.data.local.arcSidebarState.collapsedFolders.folder, false); }
  }
});
test('URL/search opening reuses the generated tab too; concurrent opens create distinct destinations', async () => {
  await seed(); const blank = await placeholder();
  const ids = await Promise.all([openUrlTab('https://search.test/', 1), openUrlTab('https://another.test/', 1)]);
  assert.equal(ids[0], blank.id); assert.notEqual(ids[0], ids[1]); assert.equal(mock.tabs.size, 2);
  assert.deepEqual([...mock.tabs.values()].map(tab => tab.url), ['https://search.test/', 'https://another.test/']);
});
test('activating an existing saved or workflow tab in the same window removes its generated blank companion', async () => {
  for (const saved of [false, true]) {
    await seed(); const blank = await placeholder();
    mock.tabs.set(100, { id: 100, windowId: 1, groupId: -1, url: 'https://favorite.test/' });
    if (saved) { mock.data.session.arcSidebarBindings.fav = 100; assert.equal(await openSavedItem('fav', 1), 100); }
    else await activateTab(100);
    await serializeState(async () => {});
    assert.equal(mock.tabs.has(blank.id), false); assert.equal(mock.tabs.has(100), true); assert.equal(mock.tabs.size, 1);
    assert.deepEqual(mock.data.session[KEY], {});
  }
});
test('a destination in another window leaves the source placeholder and its window intact', async () => {
  await seed(); const blank = await placeholder();
  mock.tabs.set(100, { id: 100, windowId: 2, groupId: -1, url: 'https://favorite.test/' });
  mock.data.session.arcSidebarBindings.fav = 100;
  assert.equal(await openSavedItem('fav', 1), 100);
  assert.equal(mock.tabs.has(blank.id), true); assert.equal(mock.tabs.size, 2);
});
test('a manual New Tab is never reused or removed', async () => {
  for (const existing of [false, true]) {
    await seed(); const manual = mock.tabs.get(10); manual.url = 'chrome://newtab/';
    if (existing) { mock.tabs.set(100, { id: 100, windowId: 1, groupId: -1 }); await activateTab(100); }
    else assert.notEqual(await openSavedItem('fav', 1), manual.id);
    assert.equal(mock.tabs.has(manual.id), true); assert.equal(manual.url, 'chrome://newtab/');
  }
});
test('navigation, pending navigation, native pinning, grouping or moving relinquish placeholder ownership', async () => {
  for (const change of [{ url: 'https://mine.test/' }, { pendingUrl: 'https://mine.test/' }, { pinned: true }, { groupId: 3 }, { windowId: 2 }]) {
    await seed(); const blank = await placeholder(); Object.assign(blank, change);
    const before = structuredClone(blank);
    assert.notEqual(await openSavedItem('fav', 1), blank.id);
    assert.deepEqual(mock.tabs.get(blank.id), before);
    assert.equal(mock.data.session[KEY]?.[blank.id], undefined);
  }
});
test('navigating away and back to New Tab does not restore disposable ownership', async () => {
  await seed(); const blank = await placeholder();
  mock.emit('updated', blank.id, { url: 'https://mine.test/' }, blank);
  mock.emit('updated', blank.id, { url: 'chrome://newtab/' }, blank);
  await serializeState(async () => {});
  assert.notEqual(await openSavedItem('fav', 1), blank.id);
  assert.equal(mock.tabs.has(blank.id), true);
});
test('session records identify placeholders without in-memory ownership; stale records cannot claim other tabs', async () => {
  await seed(); mock.tabs.get(10).url = 'chrome://newtab/';
  mock.data.session[KEY] = { 10: { windowId: 1 }, 999: { windowId: 1 } };
  assert.equal(await openSavedItem('fav', 1), 10);
  await seed(); mock.data.session[KEY] = { 999: { windowId: 1 } };
  assert.notEqual(await openSavedItem('fav', 1), 10);
  assert.equal(mock.tabs.has(10), true);
  assert.deepEqual(mock.data.session[KEY], {});
});
test('a failed navigation leaves the placeholder usable and failed cleanup leaves an activated destination intact', async () => {
  await seed(); const blank = await placeholder(); const update = chrome.tabs.update;
  chrome.tabs.update = async () => { throw Error('Navigation failed'); };
  try { await assert.rejects(openSavedItem('fav', 1), /Navigation failed/); } finally { chrome.tabs.update = update; }
  assert.equal(mock.tabs.has(blank.id), true); assert.ok(mock.data.session[KEY][blank.id]);
  mock.tabs.set(100, { id: 100, windowId: 1, groupId: -1 });
  const remove = chrome.tabs.remove; chrome.tabs.remove = async () => { throw Error('Busy'); };
  try { await activateTab(100); } finally { chrome.tabs.remove = remove; }
  assert.equal(mock.tabs.get(100).active, true); assert.equal(mock.tabs.has(blank.id), true);
});
