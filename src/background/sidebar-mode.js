import { sidebarPreferences } from '../shared/sidebar-preferences.js';
import { commitStorage } from './state-controller.js';
import { createStorageClient } from '../shared/storage-client.js';
const storage = createStorageClient({ transact: commitStorage });
chrome.runtime.onMessage.addListener((message, sender, respond) => {
  if (message?.type !== 'arc-sidebar-switch-mode') return;
  if (sender.id !== chrome.runtime.id || !sender.url?.startsWith(chrome.runtime.getURL('src/sidepanel/')) || !['native', 'overlay'].includes(message.mode)) {
    respond({ ok: false }); return;
  }
  const operation = (async () => {
    const windowId = sender.tab?.windowId ?? message.windowId;
    if (!Number.isInteger(windowId)) throw new Error('No active browser window.');
    if (message.mode === 'native') {
      // This message is sent directly by the sidebar button click.
      await chrome.sidePanel.open({ windowId });
    } else {
      if (chrome.sidePanel.close) await chrome.sidePanel.close({ windowId });
      else {
        await chrome.sidePanel.setOptions({ enabled: false });
        await chrome.sidePanel.setOptions({ enabled: true });
      }
    }
    const stored = await chrome.storage.local.get(['arcSidebarMode', 'arcSidebarAutohideTimeout']);
    await storage.local.set({ arcSidebarMode: message.mode, arcSidebarAutohideTimeout: sidebarPreferences(stored).timeout });
    const tabs = await chrome.tabs.query({ active: true, windowId });
    await Promise.allSettled(tabs.map(tab => chrome.tabs.sendMessage(tab.id, { type: 'arc-sidebar-refresh-mode' })));
    return { ok: true };
  })();
  operation.then(respond).catch(error => respond({ ok: false, error: error.message }));
  return true;
});
