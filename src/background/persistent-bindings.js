import { createStorageClient } from '../shared/storage-client.js';
import { commitStorage, serializeState } from './state-controller.js';
const sidebarStorage = createStorageClient({ transact: commitStorage });
const SESSION_KEY = 'arcSidebarBindings';
const PERSIST_KEY = 'arcSidebarPersistentBindings';
const SNAPSHOT_DELAY = 120;

let sessionBindings = {};
let persistentBindings = {};
let itemByTabId = new Map();
let initialized = false;
const snapshotTimers = new Map();
const closingWindowItems = new Set();
const recoveryRemovedItems = new Set();
export function preserveWindowBindings(tabId) {
  const itemId = itemByTabId.get(Number(tabId));
  if (itemId) closingWindowItems.add(itemId);
}

const normalizeUrl = value => {
  if (!value) return '';
  try {
    const url = new URL(value);
    url.hash = '';
    return url.href;
  } catch {
    return value;
  }
};

function rebuildReverseIndex() {
  itemByTabId = new Map();
  for (const [itemId, tabId] of Object.entries(sessionBindings)) {
    if (tabId != null) itemByTabId.set(Number(tabId), itemId);
  }
}

async function persistBindings() {
  await sidebarStorage.local.set({ [PERSIST_KEY]: persistentBindings });
}

async function snapshotBinding(itemId, tabId) {
  try {
    const tab = await chrome.tabs.get(Number(tabId));
    if (sessionBindings[itemId] !== tabId) return false;
    const currentUrl = tab.pendingUrl || tab.url || '';
    if (!currentUrl) return false;
    persistentBindings[itemId] = {
      url: currentUrl,
      normalizedUrl: normalizeUrl(currentUrl),
      title: tab.title || '',
      index: Number.isInteger(tab.index) ? tab.index : null,
      updatedAt: Date.now()
    };
    return true;
  } catch {
    return false;
  }
}

function scheduleSnapshot(itemId, tabId, delay = SNAPSHOT_DELAY) {
  const previous = snapshotTimers.get(itemId);
  if (previous) clearTimeout(previous);
  snapshotTimers.set(itemId, setTimeout(async () => {
    snapshotTimers.delete(itemId);
    if (sessionBindings[itemId] !== tabId) return;
    try { if (await snapshotBinding(itemId, tabId)) await persistBindings(); }
    catch (error) { console.warn('Arc Side of the Chrome: binding snapshot failed', error); }
  }, delay));
}

function candidateScore(tab, saved) {
  const current = normalizeUrl(tab.pendingUrl || tab.url || '');
  const expected = saved.normalizedUrl || normalizeUrl(saved.url);
  if (!current || current !== expected) return -1;
  let score = 100;
  if (saved.title && tab.title && saved.title === tab.title) score += 10;
  if (saved.index != null && tab.index === saved.index) score += 5;
  return score;
}

// Caller holds the shared state queue: recovery and opening cannot race.
export async function restoreSessionBindings(fallbackItemId) {
  const tabs = await chrome.tabs.query({});
  const stored = await chrome.storage.local.get('arcSidebarModel');
  sessionBindings = (await chrome.storage.session.get(SESSION_KEY))[SESSION_KEY] || {};
  persistentBindings = (await chrome.storage.local.get(PERSIST_KEY))[PERSIST_KEY] || {};
  const ids = new Set();
  const savedUrls = {};
  const walk = nodes => { for (const node of nodes || []) { if (node.type === 'tab') { ids.add(node.id); savedUrls[node.id] = { url: node.url }; } if (node.type === 'folder') walk(node.children); } };
  walk(stored.arcSidebarModel?.favorites);
  for (const space of stored.arcSidebarModel?.spaces || []) walk(space.children);
  const beforeBindings = { ...sessionBindings };
  const live = new Set(tabs.map(tab => tab.id));
  for (const [id, tabId] of Object.entries(sessionBindings)) if (!ids.has(id) || !live.has(Number(tabId))) delete sessionBindings[id];
  for (const id of Object.keys(persistentBindings)) if (!ids.has(id)) delete persistentBindings[id];

  const next = { ...sessionBindings };
  const claimed = new Set(Object.values(next).map(Number));
  let restored = false;

  const candidates = { ...persistentBindings };
  // Old versions may already have lost recovery metadata. Only the explicitly
  // clicked item may fall back to its original URL; never guess a changed URL.
  if (fallbackItemId && !candidates[fallbackItemId] && savedUrls[fallbackItemId]) candidates[fallbackItemId] = savedUrls[fallbackItemId];
  for (const [itemId, saved] of Object.entries(candidates)) {
    if (next[itemId] != null) continue;
    let bestTab = null;
    let bestScore = -1;
    for (const tab of tabs) {
      if (tab.id == null || claimed.has(tab.id)) continue;
      const score = candidateScore(tab, saved);
      if (score > bestScore) {
        bestScore = score;
        bestTab = tab;
      }
    }
    if (bestTab?.id != null && bestScore >= 100) {
      next[itemId] = bestTab.id;
      claimed.add(bestTab.id);
      restored = true;
    }
  }

  {
    sessionBindings = next;
    rebuildReverseIndex();
    if (JSON.stringify(beforeBindings) !== JSON.stringify(next)) {
      for (const id of Object.keys(beforeBindings)) if (!(id in next)) recoveryRemovedItems.add(id);
      await chrome.storage.session.set({ [SESSION_KEY]: next });
    }
  }
  return restored;
}

async function initialize() {
  const [session, local] = await Promise.all([
    sidebarStorage.session.get(SESSION_KEY),
    sidebarStorage.local.get(PERSIST_KEY)
  ]);
  sessionBindings = session[SESSION_KEY] || {};
  persistentBindings = local[PERSIST_KEY] || {};
  rebuildReverseIndex();
  initialized = true;
  await serializeState(restoreSessionBindings);
  for (const [itemId, tabId] of Object.entries(sessionBindings)) scheduleSnapshot(itemId, tabId, 0);
}

chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== 'session' || !changes[SESSION_KEY]) return;
  const oldBindings = changes[SESSION_KEY].oldValue || {};
  sessionBindings = changes[SESSION_KEY].newValue || {};
  rebuildReverseIndex();

  let removed = false;
  for (const itemId of Object.keys(oldBindings)) {
    if (!(itemId in sessionBindings) && itemId in persistentBindings && !recoveryRemovedItems.has(itemId) && !closingWindowItems.has(itemId)) {
      delete persistentBindings[itemId];
      removed = true;
    }
  }
  for (const id of Object.keys(oldBindings)) if (!(id in sessionBindings)) {
    closingWindowItems.delete(id);
    recoveryRemovedItems.delete(id);
  }
  if (removed) persistBindings().catch(console.warn);

  for (const [itemId, tabId] of Object.entries(sessionBindings)) {
    if (oldBindings[itemId] !== tabId) scheduleSnapshot(itemId, tabId, 0);
  }
});

function retryRecovery() {
  bindingsReady.then(() => serializeState(restoreSessionBindings)).catch(console.warn);
}
chrome.tabs.onCreated?.addListener(retryRecovery);

chrome.tabs.onUpdated.addListener((tabId, changeInfo) => {
  if (!initialized) return;
  if (!changeInfo.url && !changeInfo.title && changeInfo.status !== 'complete') return;
  const itemId = itemByTabId.get(Number(tabId));
  if (itemId) scheduleSnapshot(itemId, tabId, changeInfo.url ? 0 : SNAPSHOT_DELAY);
  else retryRecovery();
});

chrome.tabs.onMoved.addListener(tabId => {
  if (!initialized) return;
  const itemId = itemByTabId.get(Number(tabId));
  if (itemId) scheduleSnapshot(itemId, tabId);
});

chrome.tabs.onReplaced.addListener((addedTabId, removedTabId) => {
  if (!initialized) return;
  const itemId = itemByTabId.get(Number(removedTabId));
  if (itemId) scheduleSnapshot(itemId, addedTabId, 0);
});

export const bindingsReady = initialize().catch(error => console.warn('Arc Side of the Chrome: persistent binding restore failed', error));
