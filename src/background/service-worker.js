import './panel-layout.js';
import { favoriteChildDestination, appendFavoriteChildren } from './favorite-child-tabs.js';
import { watchNativeGroupVisibility, holdNativeGroupVisibility } from './native-group-visibility.js';
import { orderNativeGroups } from './native-group-order.js';
import { pruneGroupMap } from './native-group-map.js';
import './tab-actions.js';
import './persistent-bindings.js';
import { createStorageClient } from '../shared/storage-client.js';
import { commitStorage } from './state-controller.js';
const sidebarStorage = createStorageClient({ transact: commitStorage });
import './command-bar.js';
import './context-menu.js';

const STORAGE_KEY = 'arcSidebarModel';
const BINDINGS_KEY = 'arcSidebarBindings';
const GROUP_MAP_KEY = 'arcSidebarNativeGroups';
const LOCAL_MODEL_UPDATED_KEY = 'arcSidebarModelUpdatedAt';
const SYNC_ENABLED_KEY = 'arcSidebarSyncEnabled';
const SYNC_META_KEY = 'arcSidebarSyncMeta';
const SYNC_CHUNK_PREFIX = 'arcSidebarSyncChunk:';
const SYNC_SCHEMA_VERSION = 1;
const SYNC_CHUNK_SIZE = 6000;
const SIDEBAR_MODE_KEY = 'arcSidebarMode';
const MODE_RELOAD_TABS_KEY = 'arcSidebarModeReloadTabs';
const TAB_ID_NONE = -1;
const FAVORITES_GROUP_ID = '__favorites__';
const FAVORITES_GROUP = { id: FAVORITES_GROUP_ID, title: 'Favorites', color: 'grey' };
const GROUP_COLORS = ['blue', 'red', 'yellow', 'green', 'pink', 'purple', 'cyan', 'orange', 'grey'];

const nativePanelWindows = new Map();
const pendingFavoriteChildren = new Map();
let groupSyncTimer = null;
let groupSyncRunning = false;
let groupSyncPending = false;
let releaseGroupVisibility = null;
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

function isWebTab(tab) {
  const url = tab?.pendingUrl || tab?.url || '';
  return /^https?:\/\//i.test(url);
}

async function markWebTabsForModeReload() {
  try {
    const tabs = await chrome.tabs.query({});
    const tabIds = tabs.filter(tab => tab.id != null && isWebTab(tab)).map(tab => tab.id);
    if (tabIds.length) await sidebarStorage.session.set({ [MODE_RELOAD_TABS_KEY]: tabIds });
    else await sidebarStorage.session.remove(MODE_RELOAD_TABS_KEY);
  } catch (error) {
    console.warn('Arc Sidebar: could not mark tabs for sidebar-mode reload', error);
  }
}

async function reloadActivatedTabForMode(tabId) {
  try {
    const stored = await sidebarStorage.session.get(MODE_RELOAD_TABS_KEY);
    const pending = Array.isArray(stored[MODE_RELOAD_TABS_KEY]) ? stored[MODE_RELOAD_TABS_KEY] : [];
    if (!pending.includes(tabId)) return;

    const next = pending.filter(id => id !== tabId);
    if (next.length) await sidebarStorage.session.set({ [MODE_RELOAD_TABS_KEY]: next });
    else await sidebarStorage.session.remove(MODE_RELOAD_TABS_KEY);

    const tab = await chrome.tabs.get(tabId);
    if (isWebTab(tab)) await chrome.tabs.reload(tabId);
  } catch (error) {
    console.debug('Arc Sidebar: deferred sidebar-mode reload skipped', tabId, error?.message || error);
  }
}

async function isSidebarSyncEnabled() {
  const stored = await chrome.storage.sync.get(SYNC_ENABLED_KEY);
  return stored[SYNC_ENABLED_KEY] === true;
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
  if (!model) return { ok: false, reason: 'no-model' };

  const encoded = encodeBase64Utf8(JSON.stringify(model));
  const chunks = [];
  for (let offset = 0; offset < encoded.length; offset += SYNC_CHUNK_SIZE) {
    chunks.push(encoded.slice(offset, offset + SYNC_CHUNK_SIZE));
  }
  if (!chunks.length) return { ok: false, reason: 'empty-model' };

  const existing = await chrome.storage.sync.get(null);
  const updatedAt = Date.now();
  const values = {};
  chunks.forEach((chunk, index) => {
    values[chunkKey(index)] = chunk;
  });
  values[SYNC_META_KEY] = {
    schema: SYNC_SCHEMA_VERSION,
    chunks: chunks.length,
    updatedAt
  };

  try {
    await chrome.storage.sync.set(values);
    await sidebarStorage.local.set({ [LOCAL_MODEL_UPDATED_KEY]: updatedAt });
  } catch (error) {
    console.warn('Arc Sidebar: Chrome Sync write failed; local data is unchanged', error);
    return { ok: false, reason: error?.message || 'sync-write-failed' };
  }

  const staleKeys = Object.keys(existing).filter(key => {
    if (!key.startsWith(SYNC_CHUNK_PREFIX)) return false;
    const index = Number(key.slice(SYNC_CHUNK_PREFIX.length));
    return Number.isInteger(index) && index >= chunks.length;
  });
  if (staleKeys.length) {
    try { await chrome.storage.sync.remove(staleKeys); } catch {}
  }

  return { ok: true, direction: 'push', updatedAt };
}

async function applySyncedModel(synced = null) {
  const remote = synced || await readSyncedModel();
  if (!remote?.model) return { ok: false, reason: 'no-remote-model' };

  const local = await sidebarStorage.local.get(STORAGE_KEY);
  const syncedJson = modelJson(remote.model);
  const updatedAt = Number(remote.meta?.updatedAt) || Date.now();
  if (modelJson(local[STORAGE_KEY]) === syncedJson) {
    await sidebarStorage.local.set({ [LOCAL_MODEL_UPDATED_KEY]: updatedAt });
    return { ok: true, direction: 'none', updatedAt };
  }

  suppressLocalModelJson = syncedJson;
  await sidebarStorage.local.set({
    [STORAGE_KEY]: remote.model,
    [LOCAL_MODEL_UPDATED_KEY]: updatedAt
  });
  return { ok: true, direction: 'pull', updatedAt };
}

async function reconcileSidebarSync() {
  try {
    if (!await isSidebarSyncEnabled()) return { ok: false, reason: 'disabled' };

    const [local, synced] = await Promise.all([
      sidebarStorage.local.get([STORAGE_KEY, LOCAL_MODEL_UPDATED_KEY]),
      readSyncedModel()
    ]);

    const localModel = local[STORAGE_KEY];
    const localUpdatedAt = Number(local[LOCAL_MODEL_UPDATED_KEY]) || 0;

    if (synced?.model) {
      const remoteUpdatedAt = Number(synced.meta?.updatedAt) || 0;
      if (modelJson(localModel) === modelJson(synced.model)) {
        await sidebarStorage.local.set({ [LOCAL_MODEL_UPDATED_KEY]: Math.max(localUpdatedAt, remoteUpdatedAt) });
        return { ok: true, direction: 'none', updatedAt: remoteUpdatedAt || localUpdatedAt || null };
      }

      if (localModel && localUpdatedAt > remoteUpdatedAt) {
        return writeSyncedModel(localModel);
      }

      return applySyncedModel(synced);
    }

    if (localModel) return writeSyncedModel(localModel);
    return { ok: true, direction: 'none', updatedAt: null };
  } catch (error) {
    console.warn('Arc Sidebar: Chrome Sync reconciliation failed', error);
    return { ok: false, reason: error?.message || 'sync-reconcile-failed' };
  }
}

function queueModelSyncPush(delay = 350) {
  if (modelSyncPushTimer) clearTimeout(modelSyncPushTimer);
  modelSyncPushTimer = setTimeout(async () => {
    modelSyncPushTimer = null;
    try {
      if (!await isSidebarSyncEnabled()) return;
      const local = await sidebarStorage.local.get(STORAGE_KEY);
      if (local[STORAGE_KEY]) await writeSyncedModel(local[STORAGE_KEY]);
    } catch (error) {
      console.warn('Arc Sidebar: Chrome Sync push failed', error);
    }
  }, delay);
}

function queueModelSyncPull(delay = 250) {
  if (modelSyncPullTimer) clearTimeout(modelSyncPullTimer);
  modelSyncPullTimer = setTimeout(async () => {
    modelSyncPullTimer = null;
    try {
      if (!await isSidebarSyncEnabled()) return;
      await reconcileSidebarSync();
    } catch (error) {
      console.warn('Arc Sidebar: Chrome Sync pull failed', error);
    }
  }, delay);
}

function isSidebarSyncDataChange(changes) {
  return Boolean(changes?.[SYNC_META_KEY]);
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
  const stored = await sidebarStorage.session.get(GROUP_MAP_KEY);
  return stored[GROUP_MAP_KEY] || {};
}

async function saveSessionGroupMap(map) {
  await sidebarStorage.session.set({ [GROUP_MAP_KEY]: map });
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
      sidebarStorage.local.get(STORAGE_KEY),
      sidebarStorage.session.get(BINDINGS_KEY),
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
      if (!tab || tab.pinned) continue;

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

    const favoriteChildren = [...pendingFavoriteChildren.values()];
    pendingFavoriteChildren.clear();
    appendFavoriteChildren(desired, favoriteChildren, model, bindings, tabsById);

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
    const mapChanged = await pruneGroupMap(groupMap, liveKeys, model, FAVORITES_GROUP);
    if (mapChanged || desired.size) await saveSessionGroupMap(groupMap);
    await orderNativeGroups(model, groupMap, FAVORITES_GROUP);
  } finally {
    groupSyncRunning = false;
    if (groupSyncPending) {
      groupSyncPending = false;
      queueNativeGroupSync(50);
    } else if (!groupSyncTimer) {
      releaseGroupVisibility?.();
      releaseGroupVisibility = null;
    }
  }
}

function queueNativeGroupSync(delay = 120) {
  releaseGroupVisibility ||= holdNativeGroupVisibility();
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

  if (area === 'local') {
    if (changes[SIDEBAR_MODE_KEY]) markWebTabsForModeReload();

    if (changes[STORAGE_KEY]) {
      queueNativeGroupSync(80);
      const nextJson = modelJson(changes[STORAGE_KEY].newValue);
      if (suppressLocalModelJson && nextJson === suppressLocalModelJson) {
        suppressLocalModelJson = null;
      } else if (changes[STORAGE_KEY].newValue) {
        sidebarStorage.local.set({ [LOCAL_MODEL_UPDATED_KEY]: Date.now() }).catch(() => {});
        queueModelSyncPush();
      }
    }
  }

  if (area === 'sync') {
    if (changes[SYNC_ENABLED_KEY]) {
      if (changes[SYNC_ENABLED_KEY].newValue === true) {
        reconcileSidebarSync().catch(error => console.warn('Arc Sidebar: enabling Chrome Sync failed', error));
      } else {
        if (modelSyncPushTimer) clearTimeout(modelSyncPushTimer);
        if (modelSyncPullTimer) clearTimeout(modelSyncPullTimer);
        modelSyncPushTimer = null;
        modelSyncPullTimer = null;
      }
    }
    if (isSidebarSyncDataChange(changes)) queueModelSyncPull();
  }
});

chrome.tabs.onCreated.addListener(tab => {
  queueNativeGroupSync(250);
  favoriteChildDestination(tab, sidebarStorage).then(destination => {
    if (!destination) return;
    pendingFavoriteChildren.set(destination.tabId, destination);
    queueNativeGroupSync(80);
  }).catch(error => console.warn('Arc Sidebar: Favorite child routing failed', error));
});
chrome.tabs.onRemoved.addListener(() => queueNativeGroupSync(100));
chrome.tabs.onReplaced.addListener(() => queueNativeGroupSync(100));
chrome.tabs.onAttached.addListener(() => queueNativeGroupSync(100));
chrome.tabs.onDetached.addListener(() => queueNativeGroupSync(100));
chrome.tabs.onActivated.addListener(({ tabId }) => {
  reloadActivatedTabForMode(tabId);
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
  if (message?.type === 'arc-native-sidepanel-is-open') {
    const windowId = sender.tab?.windowId;
    sendResponse({ open: windowId != null && (nativePanelWindows.get(windowId) || 0) > 0 });
    return;
  }

  if (message?.type === 'arc-sidebar-sync-now') {
    reconcileSidebarSync()
      .then(result => sendResponse(result))
      .catch(error => sendResponse({ ok: false, reason: error?.message || 'sync-failed' }));
    return true;
  }
});

watchNativeGroupVisibility();

// Forward editor locks only to the content script that owns the iframe.
chrome.runtime.onMessage.addListener((message, sender, respond) => {
  if (message?.type !== 'arc-sidebar-editor-presence') return;
  if (sender.id !== chrome.runtime.id || !sender.url?.startsWith(chrome.runtime.getURL('src/sidepanel/')) || sender.tab?.id == null) {
    respond({ ok: false });
    return;
  }
  chrome.tabs.sendMessage(sender.tab.id, { type: 'arc-sidebar-editor-state', open: message.open === true })
    .then(() => respond({ ok: true })).catch(() => respond({ ok: false }));
  return true;
});
