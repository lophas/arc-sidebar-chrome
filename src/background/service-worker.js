const STORAGE_KEY = 'arcSidebarModel';
const BINDINGS_KEY = 'arcSidebarBindings';
const GROUP_MAP_KEY = 'arcSidebarNativeGroups';
const TAB_ID_NONE = -1;
const FAVORITES_GROUP_ID = '__favorites__';
const FAVORITES_GROUP = { id: FAVORITES_GROUP_ID, title: 'Favorites', color: 'grey' };
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

function buildFavoriteIds(model) {
  return new Set((model?.favorites || [])
    .filter(item => item?.type === 'tab' && item.id)
    .map(item => item.id));
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

async function getValidGroup(groupId, windowId, title) {
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

async function findReusableGroup(windowId, title, preferredTabs) {
  for (const tab of preferredTabs) {
    if (tab.groupId == null || tab.groupId === TAB_ID_NONE) continue;
    const group = await getValidGroup(tab.groupId, windowId, title);
    if (group) return group;
  }
  try {
    const groups = await chrome.tabGroups.query({ windowId });
    return groups.find(group => (group.title || '') === title) || null;
  } catch {
    return null;
  }
}

async function ensureGroupForSpace(windowId, space, tabs, groupMap) {
  const key = mapKey(windowId, space.id);
  let group = await getValidGroup(groupMap[key], windowId, space.title);
  if (!group) group = await findReusableGroup(windowId, space.title, tabs);

  const tabIds = tabs.map(tab => tab.id).filter(id => id != null);
  if (!tabIds.length) return null;

  if (!group) {
    const groupId = await chrome.tabs.group({ tabIds });
    group = await chrome.tabGroups.update(groupId, {
      title: space.title,
      color: space.color
    });
  } else {
    if (group.title !== space.title || group.color !== space.color) {
      group = await chrome.tabGroups.update(group.id, {
        title: space.title,
        color: space.color
      });
    }

    const missingTabIds = tabs
      .filter(tab => tab.groupId !== group.id)
      .map(tab => tab.id)
      .filter(id => id != null);
    if (missingTabIds.length) {
      await chrome.tabs.group({ tabIds: missingTabIds, groupId: group.id });
    }
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
    const favoriteIds = buildFavoriteIds(model);
    const tabsById = new Map(tabs.filter(tab => tab.id != null).map(tab => [tab.id, tab]));
    const desired = new Map();
    const ungroupedBoundTabs = [];

    for (const [itemId, rawTabId] of Object.entries(bindings)) {
      const tab = tabsById.get(Number(rawTabId));
      if (!tab) continue;

      let space = itemToSpace.get(itemId);
      if (!space && favoriteIds.has(itemId)) space = FAVORITES_GROUP;

      if (!space) {
        ungroupedBoundTabs.push(tab);
        continue;
      }

      const key = mapKey(tab.windowId, space.id);
      if (!desired.has(key)) desired.set(key, { windowId: tab.windowId, space, tabs: [] });
      desired.get(key).tabs.push(tab);
    }

    const ungroupIds = ungroupedBoundTabs
      .filter(tab => tab.groupId != null && tab.groupId !== TAB_ID_NONE)
      .map(tab => tab.id)
      .filter(id => id != null);
    if (ungroupIds.length) {
      try { await chrome.tabs.ungroup(ungroupIds); } catch {}
    }

    for (const entry of desired.values()) {
      try {
        await ensureGroupForSpace(entry.windowId, entry.space, entry.tabs, groupMap);
      } catch (error) {
        console.warn('Arc Sidebar: native tab group sync failed', error);
      }
    }

    const liveKeys = new Set(desired.keys());
    let mapChanged = false;
    for (const key of Object.keys(groupMap)) {
      if (!liveKeys.has(key)) {
        delete groupMap[key];
        mapChanged = true;
      }
    }
    if (mapChanged || desired.size) await saveSessionGroupMap(groupMap);
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
