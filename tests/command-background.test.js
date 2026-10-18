import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { createSearchWindowController } from '../src/background/search-window.js';
import { SEARCH_COMMAND } from '../src/shared/search-shortcut.js';

test('shortcut captures the source tab before creating the popup, with and without a command tab', async () => {
  for (const supplied of [true, false]) {
    let listener; const calls = [];
    const source = { id: 7, type: 'normal', width: 1200, height: 900, left: 10, top: 20 };
    const chrome = { commands: { onCommand: { addListener: fn => listener = fn } },
      windows: { getAll: async () => [], get: async id => { assert.equal(id, 7); return source; }, getLastFocused: async () => source,
        create: async options => calls.push(['create', options]) },
      tabs: { query: async query => { calls.push(['query', query]); return [{ id: 42 }]; } },
      runtime: { getURL: path => `chrome-extension://test/${path}`, onMessage: { addListener() {} } } };
    const context = vm.createContext({ chrome, SEARCH_COMMAND, createSearchWindowController: () => createSearchWindowController(chrome), createStorageClient: () => ({}), commitStorage() {}, console });
    const sourceCode = fs.readFileSync('src/background/command-bar.js', 'utf8').replace(/^import .*;\n/gm, '');
    vm.runInContext(sourceCode, context);
    await listener('arc-command-bar-v3');
    assert.equal(calls.length, 0, 'The retired command must not open search');
    await listener(SEARCH_COMMAND, supplied ? { id: 42, windowId: 7 } : undefined);
    const popup = calls.find(call => call[0] === 'create')[1];
    assert.equal(new URL(popup.url).searchParams.get('sourceTabId'), '42');
    assert.equal(new URL(popup.url).searchParams.get('windowId'), '7');
    if (!supplied) assert.deepEqual(JSON.parse(JSON.stringify(calls[0])), ['query', { active: true, windowId: 7 }]);
  }
});
