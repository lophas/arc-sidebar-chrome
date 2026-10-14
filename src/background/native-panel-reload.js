import { createStorageClient } from '../shared/storage-client.js';
import { commitStorage } from './state-controller.js';
import { refreshActiveSidebar } from './overlay-delivery.js';
const sidebarStorage = createStorageClient({ transact: commitStorage });
const PANEL_PATH = 'src/sidepanel/index.html';

async function followNativePanelOpen(windowId) {
  if (!Number.isInteger(windowId)) return;
  // Opening the native panel is an explicit request to keep the sidebar fixed.
  // Keep the chosen timeout and let other pages apply the mode on next focus.
  await sidebarStorage.local.set({ arcSidebarMode: 'native' });
  await refreshActiveSidebar(windowId);
}
const reportError = error => console.warn('Arc Side of the Chrome: could not apply Fixed sidebar mode', error?.message || error);

if (chrome.sidePanel?.onOpened) {
  chrome.sidePanel.onOpened.addListener(info => {
    if (info.path && info.path !== PANEL_PATH) return;
    return followNativePanelOpen(info.windowId).catch(reportError);
  });
} else {
  // Earlier Chrome versions announce actual native panels through their port.
  // Verify the context so a normal tab or embedded sidebar cannot change mode.
  chrome.runtime.onConnect.addListener(port => {
    if (port.name !== 'arc-native-sidepanel') return;
    let handled = false, connected = true;
    port.onDisconnect.addListener(() => { connected = false; });
    port.onMessage.addListener(async message => {
      if (handled || !Number.isInteger(message?.windowId)) return;
      handled = true;
      try {
        const contexts = await chrome.runtime.getContexts({ contextTypes: ['SIDE_PANEL'], windowIds: [message.windowId] });
        if (connected && contexts.some(context => context.documentUrl === chrome.runtime.getURL(PANEL_PATH))) {
          await followNativePanelOpen(message.windowId);
        }
      } catch (error) { reportError(error); }
    });
  });
}
// Closing the panel leaves Fixed selected. Only the mode switch chooses Autohide.
