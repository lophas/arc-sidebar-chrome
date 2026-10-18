import assert from 'node:assert/strict';
import { folderColorStyle } from '../src/shared/folder-color.js';

export async function checkFolderColors(page, poll, readModel) {
  const folder = () => page.locator('.folder[data-folder-node-id="folder"]');
  const savedFolder = async () => (await readModel()).spaces.find(space => space.id === 'work').children.find(node => node.id === 'folder');
  const editor = page.locator('.folder-dialog[open]');
  await page.evaluate(() => {
    window.__folderEditorEvents = [];
    window.addEventListener('unhandledrejection', event => window.__folderEditorEvents.push(String(event.reason?.stack || event.reason)));
    document.addEventListener('contextmenu', event => window.__folderEditorEvents.push({ target: event.target.className, folderId: event.target.closest('.folder-header')?.dataset.folderNodeId }), true);
  });
  const edit = async () => {
    await folder().locator(':scope > .folder-header.managed-folder').click({ button: 'right' });
    try {
      await poll(async () => await editor.count() === 1, 'Folder editor did not open');
    } catch (error) {
      console.error('Folder editor diagnostic:', await page.evaluate(async () => ({ events: window.__folderEditorEvents, state: (await chrome.storage.local.get('arcSidebarState')).arcSidebarState, dialogs: [...document.querySelectorAll('dialog')].map(el => ({ class: el.className, open: el.open, html: el.innerHTML.slice(0, 300) })) })));
      throw error;
    }
  };
  const rgb = color => 'rgb(' + [1, 3, 5].map(offset => parseInt(color.slice(offset, offset + 2), 16)).join(', ') + ')';

  await edit();
  assert.equal(await editor.locator('#folderColorMode').inputValue(), 'space');
  await editor.getByRole('button', { name: 'Amber', exact: true }).click();
  assert.equal(await editor.locator('#folderColorMode').inputValue(), 'custom');
  assert.equal(await editor.locator('.folder-color-preview').getAttribute('data-folder-color'), '#c98b52');
  await editor.locator('#folderCancel').click();
  assert.equal((await savedFolder()).color, undefined, 'Cancel must leave the model unchanged');

  await edit();
  await editor.getByRole('button', { name: 'Violet', exact: true }).click();
  await editor.locator('#folderColorHex').fill('#ggg');
  await editor.locator('#folderSave').click();
  assert.equal(await editor.count(), 1, 'Invalid colors must keep the editor open');
  await editor.locator('#folderColorHex').fill('#f80');
  await editor.locator('#folderSave').click();
  await poll(async () => (await savedFolder()).color === '#ff8800', 'Custom folder color did not save');
  await poll(async () => await folder().locator('.folder-header').evaluate(el => getComputedStyle(el).backgroundColor) === rgb(folderColorStyle('#ff8800')['--folder-heading']), 'Folder heading did not use the custom color');
  assert.equal(await folder().evaluate(el => getComputedStyle(el).overflow), 'visible', 'Close tooltips and drag indicators must not be clipped');
  await folder().locator('.folder-header').click();
  await page.locator('.folder.collapsed[data-folder-node-id="folder"]').waitFor();
  assert.equal(await folder().getAttribute('data-folder-color'), '#ff8800', 'Collapsing must preserve the folder color');
  await folder().locator('.folder-header').click();
  await page.locator('.folder:not(.collapsed)[data-folder-node-id="folder"]').waitFor();

  await page.emulateMedia({ colorScheme: 'dark' });
  await poll(async () => await folder().locator('.folder-header').evaluate(el => getComputedStyle(el).backgroundColor) === rgb(folderColorStyle('#ff8800', true)['--folder-heading']), 'Folder color did not follow dark theme');
  await page.emulateMedia({ colorScheme: 'light' });
  await edit();
  await editor.locator('#folderColorMode').selectOption('space');
  await editor.locator('#folderSave').click();
  await poll(async () => !Object.hasOwn(await savedFolder(), 'color'), 'Space color must clear the saved custom color');
  await poll(async () => await folder().getAttribute('data-folder-color') === null, 'Removing color must clear the rendered custom properties');

  await edit();
  await editor.getByRole('button', { name: 'Amber', exact: true }).click();
  await editor.locator('#folderSpace').selectOption('home');
  await editor.locator('#folderSave').click();
  await page.locator('.space-button[data-space-id="home"]').click();
  await folder().waitFor();
  assert.equal(await folder().getAttribute('data-folder-color'), '#c98b52', 'Moving to another Space must preserve the color');
  await edit();
  await editor.locator('#folderSpace').selectOption('work');
  await editor.locator('#folderSave').click();
  await page.locator('.space-button[data-space-id="work"]').click();
  await folder().waitFor();

  // A nested folder follows its own color or the Space; it never inherits its parent's custom color.
  await page.evaluate(async () => {
    const { arcSidebarModel: model } = await chrome.storage.local.get('arcSidebarModel');
    model.spaces.find(space => space.id === 'work').children.find(node => node.id === 'folder').children.push(
      { id: 'nested-colored', type: 'folder', title: 'Research', color: '#56a58c', children: [] },
      { id: 'nested-space', type: 'folder', title: 'Assets', children: [] }
    );
    await chrome.storage.local.set({ arcSidebarModel: model });
  });
  const nested = page.locator('.folder[data-folder-node-id="nested-colored"]');
  await nested.waitFor();
  assert.equal(await nested.getAttribute('data-folder-color'), '#56a58c');
  const defaultHeader = page.locator('.folder[data-folder-node-id="nested-space"] > .folder-header');
  assert.notEqual(await defaultHeader.evaluate(el => getComputedStyle(el).backgroundColor), await folder().locator(':scope > .folder-header').evaluate(el => getComputedStyle(el).backgroundColor));
  await page.locator('#search').evaluate(el => { el.value = 'Research'; el.dispatchEvent(new Event('input')); });
  await nested.waitFor();
  assert.equal(await nested.getAttribute('data-folder-color'), '#56a58c', 'Filtered folders must retain their own colors');
  await page.locator('#search').evaluate(el => { el.value = ''; el.dispatchEvent(new Event('input')); });
  await page.locator('.folder[data-folder-node-id="nested-space"]').waitFor();
  console.log('PASS real folder colors: Cancel/Save, validation, theme, collapse, reset color, moving, nested folders and filtered rendering');
}
