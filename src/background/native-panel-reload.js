import { createStorageClient } from '../shared/storage-client.js';
import { commitStorage } from './state-controller.js';
const sidebarStorage = createStorageClient({ transact: commitStorage });
const SIDEBAR_MODE_KEY = 'arcSidebarMode';
const OVERLAY_MODE = 'overlay';

const nativePanelWindows = new Map();

function isWebTab(tab) {
  const url = tab?.pendingUrl || tab?.url || '';
  return /^https?:\/\//i.test(url);
}

async function reloadActiveWebTabIfOverlay(windowId) {
  if (windowId == null) return;
  try {
    const stored = await sidebarStorage.local.get(SIDEBAR_MODE_KEY);
    const mode = stored[SIDEBAR_MODE_KEY] || OVERLAY_MODE;
    if (mode !== OVERLAY_MODE) return;

    const [tab] = await chrome.tabs.query({ windowId, active: true });
    if (tab?.id != null && isWebTab(tab)) await chrome.tabs.reload(tab.id);
  } catch (error) {
    console.debug('Arc Sidebar: native-panel page reload skipped', error?.message || error);
  }
}

chrome.runtime.onConnect.addListener(port => {
  if (port.name !== 'arc-native-sidepanel') return;

  let windowId = null;
  port.onMessage.addListener(async message => {
    if (message?.windowId == null || windowId != null) return;
    windowId = message.windowId;
    const count = (nativePanelWindows.get(windowId) || 0) + 1;
    nativePanelWindows.set(windowId, count);
    if (count === 1) await reloadActiveWebTabIfOverlay(windowId);
  });

  port.onDisconnect.addListener(async () => {
    if (windowId == null) return;
    const next = Math.max(0, (nativePanelWindows.get(windowId) || 1) - 1);
    if (next === 0) {
      nativePanelWindows.delete(windowId);
      await reloadActiveWebTabIfOverlay(windowId);
    } else {
      nativePanelWindows.set(windowId, next);
    }
  });
});
