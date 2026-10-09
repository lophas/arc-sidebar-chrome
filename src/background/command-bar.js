import { activateTab, openSavedItem, openUrlTab } from './tab-actions.js';
import { createStorageClient } from '../shared/storage-client.js';
import { commitStorage } from './state-controller.js';
const sidebarStorage = createStorageClient({ transact: commitStorage });
chrome.commands.onCommand.addListener(async (command, tab) => {
  if (command !== 'arc-command-bar-v3') return;
  try {
    const source = tab?.windowId != null ? await chrome.windows.get(tab.windowId) : await chrome.windows.getLastFocused({ windowTypes: ['normal'] });
    const width = Math.min(640, source.width || 640), height = Math.min(520, source.height || 520);
    await chrome.windows.create({ type: 'popup', url: chrome.runtime.getURL(`src/sidepanel/command.html?windowId=${source.id}`), width, height,
      left: Math.max(0, Math.round((source.left || 0) + ((source.width || width) - width) / 2)),
      top: Math.max(0, Math.round((source.top || 0) + ((source.height || height) - height) / 3)) });
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
