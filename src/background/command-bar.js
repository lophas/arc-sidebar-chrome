import { SEARCH_COMMAND } from '../shared/search-shortcut.js';
import { createSearchWindowController } from './search-window.js';
import { activateTab, openSavedItem, openUrlTab } from './tab-actions.js';
import { createStorageClient } from '../shared/storage-client.js';
import { commitStorage } from './state-controller.js';
const sidebarStorage = createStorageClient({ transact: commitStorage });
const openSearchWindow = createSearchWindowController();
chrome.commands.onCommand.addListener(async (command, tab) => {
  if (command !== SEARCH_COMMAND) return;
  try {
    await openSearchWindow(tab);
  } catch (error) { console.error('Arc Side of the Chrome search:', error); }
});

chrome.runtime.onMessage.addListener((message, sender, respond) => {
  if (message?.type !== 'arc-command-execute' || sender.id !== chrome.runtime.id) return;
  const run = async () => {
    const item = message.item;
    if (item.kind === 'Open tab') {
      await activateTab(item.tabId);
    } else if (['Pinned', 'Favorite'].includes(item.kind)) {
      await openSavedItem(item.id, message.windowId);
    } else if (['URL', 'Search'].includes(item.kind)) {
      const url = new URL(item.url);
      if (!['http:', 'https:', 'chrome:', 'file:'].includes(url.protocol)) throw new Error('Unsupported URL');
      await openUrlTab(url.href, message.windowId);
    } else if (['Folder', 'Space'].includes(item.kind)) {
      const stored = await sidebarStorage.local.get('arcSidebarState');
      const state = stored.arcSidebarState || {};
      state.currentSpaceId = item.spaceId;
      state.collapsedFolders = { ...state.collapsedFolders };
      for (const id of item.ancestors || []) state.collapsedFolders[id] = false;
      if (item.kind === 'Folder') state.collapsedFolders[item.id] = false;
      await sidebarStorage.local.patch('arcSidebarState', { currentSpaceId: state.currentSpaceId, collapsedFolders: Object.fromEntries([...(item.ancestors || []), ...(item.kind === 'Folder' ? [item.id] : [])].map(id => [id, false])) });
    } else throw new Error('Unknown command');
    return { ok: true };
  };
  run().then(respond).catch(error => respond({ ok: false, error: error.message }));
  return true;
});
