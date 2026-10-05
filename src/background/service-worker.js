const STORAGE_KEY = 'arcSidebarModel';
const BINDINGS_KEY = 'arcSidebarBindings';
const TAB_VALUE_KEY = 'arcSidebarItemId';

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

async function setSidePanelBehavior() {
  await chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });
}

function collectSavedItemIds(model) {
  const ids = new Set();

  for (const item of model?.favorites || []) {
    if (item?.type === 'tab' && item.id) ids.add(item.id);
  }

  const walk = nodes => {
    for (const node of nodes || []) {
      if (node.type === 'tab' && node.id) ids.add(node.id);
      if (node.type === 'folder') walk(node.children || []);
    }
  };

  for (const space of model?.spaces || []) walk(space.children || []);
  return ids;
}

async function validSavedItemIds() {
  const stored = await chrome.storage.local.get(STORAGE_KEY);
  return collectSavedItemIds(stored[STORAGE_KEY]);
}

async function writeBindings(bindings) {
  await chrome.storage.session.set({ [BINDINGS_KEY]: bindings });
}

async function restoreBindingsFromTabs() {
  const [tabs, validIds] = await Promise.all([
    chrome.tabs.query({}),
    validSavedItemIds()
  ]);

  const bindings = {};
  const claimedItems = new Set();

  for (const tab of tabs) {
    if (tab.id == null) continue;

    let itemId = null;
    try {
      itemId = await chrome.sessions.getTabValue(tab.id, TAB_VALUE_KEY);
    } catch {}

    if (!itemId) continue;

    if (!validIds.has(itemId) || claimedItems.has(itemId)) {
      try { await chrome.sessions.removeTabValue(tab.id, TAB_VALUE_KEY); } catch {}
      continue;
    }

    bindings[itemId] = tab.id;
    claimedItems.add(itemId);
  }

  await writeBindings(bindings);
}

async function recoverBindingForTab(tabId) {
  if (tabId == null) return;

  let itemId = null;
  try {
    itemId = await chrome.sessions.getTabValue(tabId, TAB_VALUE_KEY);
  } catch {
    return;
  }
  if (!itemId) return;

  const validIds = await validSavedItemIds();
  if (!validIds.has(itemId)) {
    try { await chrome.sessions.removeTabValue(tabId, TAB_VALUE_KEY); } catch {}
    return;
  }

  const session = await chrome.storage.session.get(BINDINGS_KEY);
  const bindings = { ...(session[BINDINGS_KEY] || {}) };

  if (bindings[itemId] !== tabId) {
    bindings[itemId] = tabId;
    await writeBindings(bindings);
  }
}

async function syncTabMarkers(change) {
  const oldBindings = change?.oldValue || {};
  const newBindings = change?.newValue || {};

  for (const [itemId, oldTabId] of Object.entries(oldBindings)) {
    if (newBindings[itemId] === oldTabId) continue;
    try {
      const existingValue = await chrome.sessions.getTabValue(oldTabId, TAB_VALUE_KEY);
      if (existingValue === itemId) {
        await chrome.sessions.removeTabValue(oldTabId, TAB_VALUE_KEY);
      }
    } catch {}
  }

  for (const [itemId, newTabId] of Object.entries(newBindings)) {
    if (oldBindings[itemId] === newTabId) continue;
    try {
      await chrome.sessions.setTabValue(newTabId, TAB_VALUE_KEY, itemId);
    } catch {}
  }
}

chrome.runtime.onInstalled.addListener(async () => {
  await setSidePanelBehavior();
  await restoreBindingsFromTabs();
});

chrome.runtime.onStartup.addListener(async () => {
  await setSidePanelBehavior();
  await restoreBindingsFromTabs();
});

chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'session' && changes[BINDINGS_KEY]) {
    syncTabMarkers(changes[BINDINGS_KEY]);
  }
});

// Chrome may restore tabs progressively after onStartup. Reconnect a tab as
// soon as its persisted sessions value becomes available.
chrome.tabs.onCreated.addListener(tab => recoverBindingForTab(tab.id));
chrome.tabs.onUpdated.addListener(tabId => recoverBindingForTab(tabId));

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
