import test from 'node:test';
import assert from 'node:assert/strict';
import { buildSearchData, buildResults, searchableTabUrl } from '../src/sidepanel/command-search.js';

const model = { favorites: [{ id: 'fav', type: 'tab', title: 'Mail', url: 'https://mail.test' }],
  spaces: [{ id: 'work', title: 'Work', children: [{ id: 'folder', type: 'folder', title: 'Research', children: [
    { id: 'pin', type: 'tab', title: 'Árvíztűrő original', url: 'https://original.test' },
    { id: 'closed', type: 'tab', title: 'Closed link', url: 'https://closed.test' }
  ] }] }] };
const tabs = [
  { id: 1, windowId: 1, groupId: 9, url: 'https://navigated.test', title: 'Different page', lastAccessed: 400 },
  { id: 2, windowId: 1, groupId: -1, url: 'https://free.test', title: 'Previous tab', lastAccessed: 300 },
  { id: 3, windowId: 1, groupId: -1, url: 'chrome://extensions/', title: 'Extensions', lastAccessed: 200 },
  { id: 4, windowId: 2, groupId: 10, url: 'https://mail.test', title: 'Inbox', lastAccessed: 100 },
  { id: 5, windowId: 1, groupId: -1, url: 'https://free.test', title: 'Second copy', lastAccessed: 50 }
];
const data = options => buildSearchData({ model, bindings: { pin: 1, fav: 4 }, tabs,
  groups: [{ id: 9, title: 'Work' }, { id: 10, title: 'Favorites' }], windowId: 1, sourceTabId: 1, ...options });

test('recent results exclude the source and keep all other live tabs in MRU order', () => {
  assert.deepEqual(buildResults(data(), '').map(item => item.tabId), [2, 3, 4, 5]);
  assert.equal(buildResults(data(), 'Different page')[0].tabId, 1, 'typed search can still select the current tab');
  assert.deepEqual(buildResults(data({ sourceTabId: 2 }), '').map(item => item.tabId), [1, 3, 4, 5]);
});
test('live bindings merge saved rows after navigation, preserving saved title, URL and folder search', () => {
  const rows = data();
  for (const query of ['arvizturo', 'original.test', 'Work Research']) {
    const matches = buildResults(rows, query).filter(item => item.kind === 'Open tab');
    assert.equal(matches.length, 1); assert.equal(matches[0].tabId, 1);
  }
  assert.equal(rows.filter(item => item.kind === 'Pinned').length, 1, 'only the closed saved link remains a separate row');
  assert.equal(rows.filter(item => item.kind === 'Favorite').length, 0);
  assert.ok(rows.find(item => item.tabId === 1).detail.includes('Work / Research'));
  assert.ok(rows.find(item => item.tabId === 4).detail.includes('Other window'));
  assert.ok(rows.find(item => item.tabId === 2).detail.includes('Ungrouped'));
});
test('equal URLs in separate tabs remain separate, including a saved but unbound link', () => {
  const rows = data({ bindings: {} });
  assert.equal(buildResults(rows, 'free.test').filter(item => item.kind === 'Open tab').length, 2);
  assert.equal(rows.filter(item => item.kind === 'Favorite').length, 1);
  assert.equal(rows.filter(item => item.kind === 'Pinned').length, 2);
});
test('existing URL input activates an existing tab; unopened URLs retain navigation and Google actions', () => {
  for (const query of ['chrome://extensions/', 'chrome://extensions', 'https://free.test', 'free.test']) {
    const rows = buildResults(data(), query);
    assert.equal(rows[0].kind, 'Open tab');
    assert.equal(rows.filter(item => item.kind === 'URL').length, 0);
    assert.equal(rows.at(-1).kind, 'Search');
  }
  assert.equal(buildResults(data(), 'https://new.test')[0].kind, 'URL');
});
test('internal pages and pending URLs are searchable, while New Tab and extension UI are excluded', () => {
  for (const url of ['chrome://extensions/', 'chrome://settings/appearance', 'chrome://downloads/', 'file:///tmp/example.html', 'https://example.test']) assert.equal(searchableTabUrl(url), true);
  for (const url of ['chrome://newtab/', 'chrome://new-tab-page/', 'chrome://new-tab-page-third-party/', 'chrome-search://local-ntp/', 'about:blank', 'chrome-extension://id/src/sidepanel/command.html', 'not a url']) assert.equal(searchableTabUrl(url), false);
  const rows = data({ tabs: [{ id: 7, pendingUrl: 'chrome://settings/', url: '', windowId: 1, groupId: -1 }] });
  assert.equal(rows.find(item => item.tabId === 7).url, 'chrome://settings/');
});
test('Chrome native pinned tabs stay read-only and never become actionable search destinations', () => {
  const rows = data({ tabs: tabs.map(tab => ({ ...tab, pinned: tab.id === 1 })) });
  assert.equal(rows.some(item => item.tabId === 1 || item.id === 'pin'), false);
});
test('typing searches all tabs before the recent-list limit is applied', () => {
  const rows = data({ tabs: Array.from({ length: 40 }, (_, i) => ({ id: i + 100, windowId: 1, groupId: -1,
    url: `https://tab${i}.test`, title: `Page ${i}`, lastAccessed: 40 - i })) });
  assert.equal(buildResults(rows, '').length, 30);
  assert.equal(buildResults(rows, 'Page 39')[0].tabId, 139);
});
