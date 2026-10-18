import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { SEARCH_COMMAND, getSearchShortcut, isDefaultSearchShortcut } from '../src/shared/search-shortcut.js';

test('manifest and handler share a fresh two-key Alt/Option+K command', () => {
  const manifest = JSON.parse(fs.readFileSync('manifest.json', 'utf8'));
  assert.deepEqual(Object.keys(manifest.commands), [SEARCH_COMMAND]);
  assert.deepEqual(manifest.commands[SEARCH_COMMAND].suggested_key, { default: 'Alt+K', mac: 'Alt+K' });
});

test('read the actual assignment without advertising an unregistered default', async () => {
  for (const shortcut of ['Alt+K', '⌥K', 'Ctrl+Shift+Y', '']) {
    assert.equal(await getSearchShortcut({ getAll: async () => [{ name: SEARCH_COMMAND, shortcut }] }), shortcut);
  }
  assert.equal(await getSearchShortcut({ getAll: async () => [{ name: 'arc-command-bar-v3', shortcut: 'Ctrl+K' }] }), '');
  assert.equal(await getSearchShortcut({ getAll: async () => { throw Error('Unavailable'); } }), '');
  assert.equal(await getSearchShortcut({}), '');
});

test('local fallback respects registration, modifiers and Option-generated characters', () => {
  const event = { code: 'KeyK', key: '˚', altKey: true };
  for (const shortcut of ['Alt+K', 'Option+K', '⌥K']) assert.equal(isDefaultSearchShortcut(event, shortcut), true);
  for (const shortcut of ['', 'Ctrl+K', 'Ctrl+Shift+Y']) assert.equal(isDefaultSearchShortcut(event, shortcut), false);
  for (const flag of ['ctrlKey', 'metaKey', 'shiftKey', 'isComposing', 'repeat']) {
    assert.equal(isDefaultSearchShortcut({ ...event, [flag]: true }, 'Alt+K'), false);
  }
  assert.equal(isDefaultSearchShortcut({ ...event, altKey: false, metaKey: true }, 'Alt+K'), false);
});
