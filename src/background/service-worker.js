const STORAGE_KEY = 'arcSidebarModel';
const BINDINGS_KEY = 'arcSidebarBindings';
const GROUP_MAP_KEY = 'arcSidebarNativeGroups';
const TAB_ID_NONE = -1;
const GROUP_COLORS = ['blue', 'red', 'yellow', 'green', 'pink', 'purple', 'cyan', 'orange', 'grey'];

const nativePanelWindows = new Map();
let groupSyncTimer = null;
let groupSyncRunning = false;
let groupSyncPending = false;

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

function buildSpaceIndex(model) {
  const itemToSpace = new Map();
  const spaces = model?.spaces || [];

  const walk = (nodes, space) => {
    for (const node of nodes || []) {
      if (node?.type === 'tab' && node.id) itemToSpace.set(node.id, space);
      if (node?.type === 'folder') walk(node.children || [], space);
    }
  };

  spaces.forEach((space, index) => {
    walk(space.children || [], {
      id: space.id,
      title: space.title || 'Untitled Space',
      color: GROUP_COLORS[index % GROUP_COLORS.length]
    });
  });

  return itemToSpace;
}

async function getSessionGroupMap() {
  const stored = await chrome.storage.session.get(GROUP_MAP_KEY);
  return stored[GROUP_MAP_KEY] || {};
}

async function saveSessionGroupMap(map) {
  await chrome.storage.session.set({ [GROUP_MAP_KEY]: map });
}

function mapKey(windowId, spaceId) {
  return `${windowId}:${spaceId}`;
}

async function validGroup(groupId, windowId, title) {
  if (groupId == null || groupId === TAB_ID_NONE) return null;
  try {
    const group = await chrome.tabGroups.get(groupId);
    if (group.windowId !== windowId) return null;
    if ((group.title || '') !== title) return null;
    return group;
  } catch {
    return null;
  }
}

async function findReusableGroup(windowId, title, preferredTabIds) {
  for (const tabId of preferredTabIds) {
    try {
      const tab = await chrome.tabs.get(tabId);
      if (tab.groupId == null || tab.groupId === TAB_ID_NONE) continue;
      const group = await validGroup(tab.groupId, windowId, title);
      if (group) return group;
    } catch {}
  }

  try {
    const groups = await chrome.tabGroups.query({ windowId });
    return groups.find(group => (group.title || '') === title) || null;
  } catch {
    return null;
  }
}

async function ensureGroupForSpace(windowId, space, tabIds, groupMap) {
  const key = mapKey(windowId, space.id);
  let group = await validGroup(groupMap[key], windowId, space.title);

  if (!group) {
    group = await findReusableGroup(windowId, space.title, tabIds);
  }

  if (!group) {
    const groupId = await chrome.tabs.group({ tabIds });
    group = await chrome.tabGroups.update(groupId, {
      title: space.title,
      color: space.color
    });
  } else {
    await chrome.tabGroups.update(group.id, {
      title: space.title,
      color: space.color
    });
    await chrome.tabs.group({ tabIds, groupId: group.id });
  }

  groupMap[key] = group.id;
  return group.id;
}

async function syncNativeGroupsNow() {
  if (groupSyncRunning) {
    groupSyncPending = true;
    return;
  }

  groupSyncRunning = true;
  try {
    const [local, session, tabs, groupMap] = await Promise.all([
      chrome.storage.local.get(STORAGE_KEY),
      chrome.storage.session.get(BINDINGS_KEY),
      chrome.tabs.query({}),
      getSessionGroupMap()
    ]);

    const model = local[STORAGE_KEY];
    const bindings = session[BINDINGS_KEY] || {};
    const itemToSpace = buildSpaceIndex(model);
    const tabsById = new Map(tabs.filter(tab => tab.id != null).map(tab => [tab.id, tab]));
    const desiredByWindowAndSpace = new Map();
    const boundTabsWithoutSpace = [];

    for (const [itemId, tabId] of Object.entries(bindings)) {
      const numericTabId = Number(tabId);
      const tab = tabsById.get(numericTabId);
      if (!tab) continue;

      const space = itemToSpace.get(itemId);
      if (!space) {
        boundTabsWithoutSpace.push(tab);
        continue;
      }

      const key = mapKey(tab.windowId, space.id);
      if (!desiredByWindowAndSpace.has(key)) {
        desiredByWindowAndSpace.set(key, {
          windowId: tab.windowId,
          space,
          tabIds: []
        });
      }
      desiredByWindowAndSpace.get(key).tabIds.push(numericTabId);
    }

    // Pure Favorites stay ungrouped. If an item also exists inside a Space,
    // buildSpaceIndex() maps it to that Space and it is grouped there instead.
    const ungroupIds = boundTabsWithoutSpace
      .filter(tab => tab.groupId != null && tab.groupId !== TAB_ID_NONE)
      .map(tab => tab.id)
      .filter(id => id != null);
    if (ungroupIds.length) {
      try { await chrome.tabs.ungroup(ungroupIds); } catch {}
    }

    for (const entry of desiredByWindowAndSpace.values()) {
      if (!entry.tabIds.length) continue;
      try {
        await ensureGroupForSpace(entry.windowId, entry.space, entry.tabIds, groupMap);
      } catch (error) {
        console.warn('Arc Sidebar: native tab group sync failed', error);
      }
    }

    // Drop dead group-map entries so restart/window churn does not accumulate junk.
    const liveKeys = new Set(desiredByWindowAndSpace.keys());
    for (const key of Object.keys(groupMap)) {
      if (!liveKeys.has(key)) delete groupMap[key];
    }
    await saveSessionGroupMap(groupMap);
  } finally {
    groupSyncRunning = false;
    if (groupSyncPending) {
      groupSyncPending = false;
      queueNativeGroupSync(50);
    }
  }
}

function queueNativeGroupSync(delay = 120) {
  if (groupSyncTimer) clearTimeout(groupSyncTimer);
  groupSyncTimer = setTimeout(() => {
    groupSyncTimer = null;
    syncNativeGroupsNow().catch(error => {
      console.warn('Arc Sidebar: native tab group sync error', error);
    });
  }, delay);
}

chrome.runtime.onInstalled.addListener(async () => {
  await setSidePanelBehavior();
  queueNativeGroupSync(250);
});

chrome.runtime.onStartup.addListener(async () => {
  await setSidePanelBehavior();
  queueNativeGroupSync(750);
});

chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'session' && changes[BINDINGS_KEY]) queueNativeGroupSync(80);
  if (area === 'local' && changes[STORAGE_KEY]) queueNativeGroupSync(80);
});

chrome.tabs.onCreated.addListener(() => queueNativeGroupSync(250));
chrome.tabs.onRemoved.addListener(() => queueNativeGroupSync(100));
chrome.tabs.onReplaced.addListener(() => queueNativeGroupSync(100));
chrome.tabs.onAttached.addListener(() => queueNativeGroupSync(100));
chrome.tabs.onDetached.addListener(() => queueNativeGroupSync(100));

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
