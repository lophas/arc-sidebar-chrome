import test from 'node:test';
import assert from 'node:assert/strict';
import { FOLDER_COLORS, normalizeFolderColor, folderColorStyle, applyFolderColor } from '../src/shared/folder-color.js';
import { withSpacePalettes } from '../src/shared/space-palette.js';
import { mergeChange } from '../src/shared/state-merge.js';

const luminance = color => [1, 3, 5].map(offset => parseInt(color.slice(offset, offset + 2), 16) / 255)
  .map(value => value <= .04045 ? value / 12.92 : ((value + .055) / 1.055) ** 2.4)
  .reduce((sum, channel, index) => sum + channel * [.2126, .7152, .0722][index], 0);
const contrast = (a, b) => (Math.max(luminance(a), luminance(b)) + .05) / (Math.min(luminance(a), luminance(b)) + .05);

test('folder colors reject CSS injection and missing or malformed backup values', () => {
  assert.equal(normalizeFolderColor(' #ABC '), '#aabbcc');
  for (const value of [null, undefined, {}, ['#123456'], 'red', 'url(https://evil.test)', '#12345g', '#fff; color:red']) {
    assert.equal(normalizeFolderColor(value), null);
    assert.deepEqual(folderColorStyle(value), {});
  }
});

test('preset and extreme custom folder colors keep text readable in both themes', () => {
  const colors = [...FOLDER_COLORS.map(preset => preset.color), '#000000', '#ffffff', '#ff0000', '#00ff00', '#0000ff', '#ffff00', '#00ffff', '#ff00ff'];
  for (const color of colors) for (const dark of [false, true]) {
    const style = folderColorStyle(color, dark);
    for (const background of ['--folder-heading', '--folder-background', '--folder-selected']) {
      for (const text of ['--folder-foreground', '--folder-muted']) {
        assert.ok(contrast(style[background], style[text]) >= 4.5, JSON.stringify({ color, dark, background, text }));
      }
    }
  }
});

test('clearing a saved color removes custom properties and restores Space styling', () => {
  const properties = new Map();
  const element = { dataset: {}, style: { setProperty: (key, value) => properties.set(key, value), removeProperty: key => properties.delete(key) } };
  applyFolderColor(element, '#c98b52');
  assert.equal(element.dataset.folderColor, '#c98b52');
  assert.match(properties.get('--folder-heading'), /^light-dark\(/);
  applyFolderColor(element, null);
  assert.equal(Object.hasOwn(element.dataset, 'folderColor'), false);
  assert.equal(properties.size, 0);
});

test('folder colors survive backup JSON, palette migration and concurrent link edits', () => {
  const before = withSpacePalettes({ favorites: [], spaces: [{ id: 'work', children: [{ id: 'folder', type: 'folder', title: 'Project', children: [{ id: 'inner', type: 'folder', color: '#56a58c', children: [] }] }] }] });
  const edited = structuredClone(before), latest = structuredClone(before);
  edited.spaces[0].children[0].color = '#c98b52';
  latest.spaces[0].children[0].title = 'Renamed elsewhere';
  latest.spaces[0].children[0].children.push({ id: 'pin', type: 'tab', url: 'https://a.test' });
  const merged = mergeChange(latest, before, edited);
  const restored = withSpacePalettes(JSON.parse(JSON.stringify({ format: 'arc-sidebar-backup', version: 2, model: merged })).model);
  assert.deepEqual(restored, merged);
  const folder = restored.spaces[0].children[0];
  assert.equal(folder.color, '#c98b52');
  assert.equal(folder.title, 'Renamed elsewhere');
  assert.equal(folder.children[0].color, '#56a58c');
  assert.equal(folder.children[1].url, 'https://a.test');
});
