import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { SEARCH_COMMAND, getSearchShortcut, isDefaultSearchShortcut } from '../src/shared/search-shortcut.js';

test('manifest and handler share a fresh two-key Alt/Option+T command', () => {
  const manifest = JSON.parse(fs.readFileSync('manifest.json', 'utf8'));
  assert.deepEqual(Object.keys(manifest.commands), [SEARCH_COMMAND]);
  assert.deepEqual(manifest.commands[SEARCH_COMMAND].suggested_key, { default: 'Alt+T', mac: 'Alt+T' });
});

test('read the actual assignment without advertising an unregistered default', async () => {
  for (const shortcut of ['Alt+T', '⌥T', 'Ctrl+Shift+Y', '']) {
    assert.equal(await getSearchShortcut({ getAll: async () => [{ name: SEARCH_COMMAND, shortcut }] }), shortcut);
  }
  assert.equal(await getSearchShortcut({ getAll: async () => [{ name: 'arc-command-bar-v3', shortcut: 'Ctrl+K' }] }), '');
  assert.equal(await getSearchShortcut({ getAll: async () => { throw Error('Unavailable'); } }), '');
  assert.equal(await getSearchShortcut({}), '');
});

test('local fallback respects registration, modifiers and Option-generated characters', () => {
  const event = { code: 'KeyT', key: '†', altKey: true };
  for (const shortcut of ['Alt+T', 'Option+T', '⌥T']) assert.equal(isDefaultSearchShortcut(event, shortcut), true);
  for (const shortcut of ['', 'Ctrl+K', 'Ctrl+Shift+Y']) assert.equal(isDefaultSearchShortcut(event, shortcut), false);
  for (const flag of ['ctrlKey', 'metaKey', 'shiftKey', 'isComposing', 'repeat']) {
    assert.equal(isDefaultSearchShortcut({ ...event, [flag]: true }, 'Alt+T'), false);
  }
  assert.equal(isDefaultSearchShortcut({ ...event, altKey: false, metaKey: true }, 'Alt+T'), false);
});
