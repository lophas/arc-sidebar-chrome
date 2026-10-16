import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { sidebarPreferences } from '../src/shared/sidebar-preferences.js';
import { canAutohideUrl } from '../src/shared/autohide-availability.js';

function setup(settings = {}) {
  const tabs = new Map([[1, { id: 1, url: 'https://example.test/' }], [2, { id: 2, url: 'chrome://settings/' }]]);
  const toolbar = new Map(), events = {}, calls = [];
  const event = key => ({ addListener: fn => { events[key] = fn; } });
  const action = Object.fromEntries(['setBadgeBackgroundColor', 'setBadgeTextColor', 'setBadgeText', 'setTitle'].map(name => [name, async details => {
    assert.ok(tabs.has(details.tabId));
    calls.push([name, details]);
    toolbar.set(details.tabId, { ...toolbar.get(details.tabId), ...details });
  }]));
  const chrome = { action, runtime: { onInstalled: event('installed'), onStartup: event('startup') }, storage: { local: { get: async () => ({ ...settings }) }, onChanged: event('storage') }, tabs: {
    get: async id => { if (!tabs.has(id)) throw Error('No tab'); return { ...tabs.get(id) }; },
    query: async () => [...tabs.values()].map(tab => ({ ...tab })),
    onActivated: event('activate'), onUpdated: event('update'), onRemoved: event('remove')
  } };
  const source = fs.readFileSync('src/background/autohide-indicator.js', 'utf8').replace(/^import .*;\n/gm, '').replace(/export /g, '');
  const context = { chrome, sidebarPreferences, canAutohideUrl, enlargeToolbarIcon: async () => {} };
  vm.createContext(context); vm.runInContext(source, context);
  return { tabs, toolbar, events, calls, settings, refresh: context.refreshAutohideIndicator, blocked: context.markAutohideBlocked };
}

test('autohide excludes protected stores and browser URLs without excluding lookalike HTTPS sites', () => {
  for (const url of ['chrome://extensions/', 'chrome-error://chromewebdata/', 'about:blank', 'file:///tmp/test.html', 'https://chromewebstore.google.com/', 'https://chrome.google.com/webstore/detail/test', 'invalid']) assert.equal(canAutohideUrl(url), false, url);
  for (const url of ['https://example.test/', 'http://example.test/', 'https://chrome.google.com/other', 'https://chromewebstore.google.com.example.test/', 'https://chrome.google.com/webstore-other']) assert.equal(canAutohideUrl(url), true, url);
});

test('warning is tab-specific, yellow with dark text and restores the default tooltip after navigation', async () => {
  const s = setup(); await s.refresh();
  assert.equal(s.toolbar.get(1).text, ''); assert.equal(s.toolbar.get(2).text, '!');
  assert.match(s.toolbar.get(2).title, /Click to open the fixed sidebar/);
  assert.ok(s.calls.some(([name, d]) => name === 'setBadgeBackgroundColor' && d.color === '#fbbf24'));
  assert.ok(s.calls.some(([name, d]) => name === 'setBadgeTextColor' && d.color === '#18181a'));
  const count = s.calls.length; await s.refresh(); assert.equal(s.calls.length, count);
  s.tabs.get(2).url = 'https://example.test/'; s.events.update(2, { url: s.tabs.get(2).url }); await s.refresh(2);
  assert.equal(s.toolbar.get(2).text, ''); assert.equal(s.toolbar.get(2).title, 'Open Arc Side of the Chrome');
  s.tabs.get(1).pendingUrl = 'https://chromewebstore.google.com/'; await s.refresh(1);
  assert.equal(s.toolbar.get(1).text, '!');
});

test('Fixed clears every warning, including inactive tabs, and legacy disabled timeout stays unmarked', async () => {
  const s = setup(); await s.refresh();
  s.settings.arcSidebarMode = 'native'; s.events.storage({ arcSidebarMode: {} }, 'local'); await s.refresh(1);
  assert.equal(s.toolbar.get(2).text, '');
  s.settings.arcSidebarMode = 'overlay'; s.events.storage({ arcSidebarMode: {} }, 'local'); await s.refresh(2);
  assert.equal(s.toolbar.get(2).text, '!');
  s.settings.arcSidebarAutohideTimeout = 0; s.events.storage({ arcSidebarAutohideTimeout: {} }, 'local'); await s.refresh(2);
  assert.equal(s.toolbar.get(2).text, '');
});

test('actual injection restrictions on HTTPS error pages warn; navigation races do not and retry navigation clears the warning', async () => {
  const s = setup(); await s.refresh();
  await s.blocked(1, Error('Frame was removed')); await s.refresh(1); assert.equal(s.toolbar.get(1).text, '');
  await s.blocked(1, Error('Cannot access contents of url https://example.test/')); assert.equal(s.toolbar.get(1).text, '!');
  s.events.update(1, { status: 'loading' }); await s.refresh(1); assert.equal(s.toolbar.get(1).text, '');
  s.tabs.delete(1); s.events.remove(1); await s.refresh(1);
});

test('queued stale refresh cannot leave a warning after a mode change', async () => {
  const s = setup(); await s.refresh();
  const pending = s.refresh(2); s.settings.arcSidebarMode = 'native';
  s.events.storage({ arcSidebarMode: {} }, 'local'); await pending; await s.refresh();
  assert.equal(s.toolbar.get(2).text, '');
});

for (const lifecycle of ['installed', 'startup']) {
  test(`${lifecycle} rechecks already-open tabs after Chrome resets toolbar state without changing the mode`, async () => {
    const s = setup({ arcSidebarMode: 'overlay', arcSidebarAutohideTimeout: 800 });
    await s.refresh();
    assert.equal(s.toolbar.get(2).text, '!');
    // Extension initialization can run before Chrome finishes resetting the action.
    s.toolbar.clear();
    s.events[lifecycle]({ reason: 'update' });
    await s.refresh();
    assert.equal(s.toolbar.get(2).text, '!');
    assert.match(s.toolbar.get(2).title, /Click to open the fixed sidebar/);
    assert.equal(s.toolbar.get(1).text, '');
    assert.equal(s.settings.arcSidebarMode, 'overlay');
    s.settings.arcSidebarMode = 'native';
    s.toolbar.clear();
    s.events[lifecycle]({ reason: 'update' });
    await s.refresh();
    assert.equal(s.toolbar.get(2).text, '');
  });
}
