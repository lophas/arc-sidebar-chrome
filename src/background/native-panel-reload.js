import { createStorageClient } from '../shared/storage-client.js';
import { commitStorage } from './state-controller.js';
import { refreshActiveSidebar } from './overlay-delivery.js';
const sidebarStorage = createStorageClient({ transact: commitStorage });
const PANEL_PATH = 'src/sidepanel/index.html';

async function followNativePanelOpen(windowId) {
  if (!Number.isInteger(windowId)) return;
  // Opening the native panel is an explicit request to keep the sidebar fixed.
  // Keep the chosen timeout and let other pages apply the mode on next focus.
  const stored = await sidebarStorage.local.get('arcSidebarMode');
  if (stored.arcSidebarMode !== 'native') await sidebarStorage.local.set({ arcSidebarMode: 'native' });
  await refreshActiveSidebar(windowId);
}
const reportError = error => console.warn('Arc Side of the Chrome: could not apply Fixed sidebar mode', error?.message || error);

if (chrome.sidePanel?.onOpened) {
  chrome.sidePanel.onOpened.addListener(info => {
    const path = info.path?.replace(/^\//, '');
    if (path && path !== PANEL_PATH && path !== chrome.runtime.getURL(PANEL_PATH)) return;
    return followNativePanelOpen(info.windowId).catch(reportError);
  });
}
{
  // Native presence also covers browsers that expose but do not fire onOpened.
  // Verify the context so a normal tab or embedded sidebar cannot change mode.
  chrome.runtime.onConnect.addListener(port => {
    if (port.name !== 'arc-native-sidepanel' || port.sender?.url !== chrome.runtime.getURL(PANEL_PATH) || port.sender?.tab) return;
    let handled = false, connected = true;
    port.onDisconnect.addListener(() => { connected = false; });
    port.onMessage.addListener(async message => {
      if (handled || !Number.isInteger(message?.windowId)) return;
      handled = true;
      try {
        const contexts = await chrome.runtime.getContexts({ contextTypes: ['SIDE_PANEL'], ...(port.sender.documentId ? {documentIds: [port.sender.documentId]} : {}) });
        if (connected && contexts.some(context => context.documentUrl === chrome.runtime.getURL(PANEL_PATH))) {
          await followNativePanelOpen(message.windowId);
        }
      } catch (error) { reportError(error); }
    });
  });
}
// Closing the panel leaves Fixed selected. Only the mode switch chooses Autohide.
