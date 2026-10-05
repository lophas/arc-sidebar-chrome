const nativePanelWindows = new Map();

async function broadcastNativePanelState(windowId, open) {
  if (windowId == null) return;
  try {
    const tabs = await chrome.tabs.query({ windowId });
    await Promise.allSettled(tabs
      .filter(tab => tab.id != null)
      .map(tab => chrome.tabs.sendMessage(tab.id, {
        type: 'arc-native-sidepanel-state',
        open
      })));
  } catch {}
}

chrome.runtime.onInstalled.addListener(async () => {
  await chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });
});

chrome.runtime.onStartup.addListener(async () => {
  await chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });
});

chrome.runtime.onConnect.addListener(port => {
  if (port.name !== 'arc-native-sidepanel') return;

  let windowId = null;

  port.onMessage.addListener(async message => {
    if (message?.windowId == null || windowId != null) return;
    windowId = message.windowId;
    const count = (nativePanelWindows.get(windowId) || 0) + 1;
    nativePanelWindows.set(windowId, count);
    if (count === 1) await broadcastNativePanelState(windowId, true);
  });

  port.onDisconnect.addListener(async () => {
    if (windowId == null) return;
    const next = Math.max(0, (nativePanelWindows.get(windowId) || 1) - 1);
    if (next === 0) {
      nativePanelWindows.delete(windowId);
      await broadcastNativePanelState(windowId, false);
    } else {
      nativePanelWindows.set(windowId, next);
    }
  });
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.type !== 'arc-native-sidepanel-is-open') return;
  const windowId = sender.tab?.windowId;
  sendResponse({ open: windowId != null && (nativePanelWindows.get(windowId) || 0) > 0 });
});
