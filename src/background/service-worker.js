const STORAGE_KEY = 'arcSidebarModel';
const BINDINGS_KEY = 'arcSidebarBindings';
const GROUP_MAP_KEY = 'arcSidebarNativeGroups';
const SYNC_META_KEY = 'arcSidebarSyncMeta';
const SYNC_CHUNK_PREFIX = 'arcSidebarSyncChunk:';
const SYNC_SCHEMA_VERSION = 1;
const SYNC_CHUNK_SIZE = 6000;
const TAB_ID_NONE = -1;
const FAVORITES_GROUP_ID = '__favorites__';
const FAVORITES_GROUP = { id: FAVORITES_GROUP_ID, title: 'Favorites', color: 'grey' };
const GROUP_COLORS = ['blue', 'red', 'yellow', 'green', 'pink', 'purple', 'cyan', 'orange', 'grey'];

const nativePanelWindows = new Map();
let groupSyncTimer = null;
let groupSyncRunning = false;
let groupSyncPending = false;
let modelSyncPushTimer = null;
let modelSyncPullTimer = null;
let suppressLocalModelJson = null;

function modelJson(model) {
  return model ? JSON.stringify(model) : '';
}

function encodeBase64Utf8(text) {
  const bytes = new TextEncoder().encode(text);
  let binary = '';
  const step = 0x8000;
  for (let offset = 0; offset < bytes.length; offset += step) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + step));
  }
  return btoa(binary);
}

function decodeBase64Utf8(value) {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return new TextDecoder().decode(bytes);
}

function chunkKey(index) {
  return `${SYNC_CHUNK_PREFIX}${index}`;
}

async function readSyncedModel() {
  const data = await chrome.storage.sync.get(null);
  const meta = data[SYNC_META_KEY];
  if (!meta || meta.schema !== SYNC_SCHEMA_VERSION || !Number.isInteger(meta.chunks) || meta.chunks < 1) {
    return null;
  }

  let encoded = '';
  for (let index = 0; index < meta.chunks; index += 1) {
    const chunk = data[chunkKey(index)];
    if (typeof chunk !== 'string') return null;
    encoded += chunk;
  }

  try {
    const model = JSON.parse(decodeBase64Utf8(encoded));
    return { model, meta };
  } catch (error) {
    console.warn('Arc Sidebar: synced model could not be decoded', error);
    return null;
  }
}

async function writeSyncedModel(model) {
  if (!model) return;

  const encoded = encodeBase64Utf8(JSON.stringify(model));
  const chunks = [];
  for (let offset = 0; offset < encoded.length; offset += SYNC_CHUNK_SIZE) {
    chunks.push(encoded.slice(offset, offset + SYNC_CHUNK_SIZE));
  }
  if (!chunks.length) return;

  const existing = await chrome.storage.sync.get(null);
  const values = {};
  chunks.forEach((chunk, index) => {
    values[chunkKey(index)] = chunk;
  });
  values[SYNC_META_KEY] = {
    schema: SYNC_SCHEMA_VERSION,
    chunks: chunks.length,
    updatedAt: Date.now()
  };

  try {
    await chrome.storage.sync.set(values);
  } catch (error) {
    console.warn('Arc Sidebar: Chrome Sync write failed; local data is unchanged', error);
    return;
  }

  const staleKeys = Object.keys(existing).filter(key => {
    if (!key.startsWith(SYNC_CHUNK_PREFIX)) return false;
    const index = Number(key.slice(SYNC_CHUNK_PREFIX.length));
    return Number.isInteger(index) && index >= chunks.length;
  });
  if (staleKeys.length) {
    try { await chrome.storage.sync.remove(staleKeys); } catch {}
  }
}

async function applySyncedModel() {
  const synced = await readSyncedModel();
  if (!synced?.model) return false;

  const local = await chrome.storage.local.get(STORAGE_KEY);
  const syncedJson = modelJson(synced.model);
  if (modelJson(local[STORAGE_KEY]) === syncedJson) return true;

  suppressLocalModelJson = syncedJson;
  await chrome.storage.local.set({ [STORAGE_KEY]: synced.model });
  return true;
}

async function reconcileSidebarSync() {
  try {
    const [local, synced] = await Promise.all([
      chrome.storage.local.get(STORAGE_KEY),
      readSyncedModel()
    ]);

    if (synced?.model) {
      const syncedJson = modelJson(synced.model);
      if (modelJson(local[STORAGE_KEY]) !== syncedJson) {
        suppressLocalModelJson = syncedJson;
        await chrome.storage.local.set({ [STORAGE_KEY]: synced.model });
      }
      return;
    }

    if (local[STORAGE_KEY]) await writeSyncedModel(local[STORAGE_KEY]);
  } catch (error) {
    console.warn('Arc Sidebar: Chrome Sync reconciliation failed', error);
  }
}

function queueModelSyncPush(delay = 350) {
  if (modelSyncPushTimer) clearTimeout(modelSyncPushTimer);
  modelSyncPushTimer = setTimeout(async () => {
    modelSyncPushTimer = null;
    try {
      const local = await chrome.storage.local.get(STORAGE_KEY);
      if (local[STORAGE_KEY]) await writeSyncedModel(local[STORAGE_KEY]);
    } catch (error) {
      console.warn('Arc Sidebar: Chrome Sync push failed', error);
    }
  }, delay);
}

function queueModelSyncPull(delay = 250) {
  if (modelSyncPullTimer) clearTimeout(modelSyncPullTimer);
  modelSyncPullTimer = setTimeout(() => {
    modelSyncPullTimer = null;
    applySyncedModel().catch(error => {
      console.warn('Arc Sidebar: Chrome Sync pull failed', error);
    });
  }, delay);
}

function isSidebarSyncChange(changes) {
  return Object.keys(changes || {}).some(key => key === SYNC_META_KEY || key.startsWith(SYNC_CHUNK_PREFIX));
}

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
  await reconcileSidebarSync();
  queueNativeGroupSync(250);
});

chrome.runtime.onStartup.addListener(async () => {
  await setSidePanelBehavior();
  await reconcileSidebarSync();
  queueNativeGroupSync(750);
});

chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'session' && changes[BINDINGS_KEY]) queueNativeGroupSync(80);

  if (area === 'local' && changes[STORAGE_KEY]) {
    queueNativeGroupSync(80);
    const nextJson = modelJson(changes[STORAGE_KEY].newValue);
    if (suppressLocalModelJson && nextJson === suppressLocalModelJson) {
      suppressLocalModelJson = null;
    } else if (changes[STORAGE_KEY].newValue) {
      queueModelSyncPush();
    }
  }

  if (area === 'sync' && isSidebarSyncChange(changes)) {
    queueModelSyncPull();
  }
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
