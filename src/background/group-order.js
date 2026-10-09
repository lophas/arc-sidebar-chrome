import { createStorageClient } from '../shared/storage-client.js';
import { commitStorage } from './state-controller.js';
const sidebarStorage = createStorageClient({ transact: commitStorage });
const STORAGE_KEY = 'arcSidebarModel';
const BINDINGS_KEY = 'arcSidebarBindings';
const TAB_ID_NONE = -1;

let reorderTimer = null;
let reorderRunning = false;
let reorderPending = false;

function flattenItemIds(nodes, output = []) {
  for (const node of nodes || []) {
    if (node?.type === 'tab' && node.id) output.push(node.id);
    if (node?.type === 'folder') flattenItemIds(node.children || [], output);
  }
  return output;
}

function buildSidebarOrders(model) {
  const orders = [];

  const favoriteIds = (model?.favorites || [])
    .filter(item => item?.type === 'tab' && item.id)
    .map(item => item.id);
  if (favoriteIds.length) orders.push(favoriteIds);

  for (const space of model?.spaces || []) {
    const ids = flattenItemIds(space.children || []);
    if (ids.length) orders.push(ids);
  }

  return orders;
}

async function reorderNativeGroupsNow() {
  if (reorderRunning) {
    reorderPending = true;
    return;
  }

  reorderRunning = true;
  try {
    const [local, session, allTabs] = await Promise.all([
      sidebarStorage.local.get(STORAGE_KEY),
      sidebarStorage.session.get(BINDINGS_KEY),
      chrome.tabs.query({})
    ]);

    const model = local[STORAGE_KEY];
    const bindings = session[BINDINGS_KEY] || {};
    if (!model || !Object.keys(bindings).length) return;

    const tabsById = new Map(
      allTabs.filter(tab => tab.id != null).map(tab => [tab.id, tab])
    );

    for (const orderedItemIds of buildSidebarOrders(model)) {
      // A Space may have live tabs in more than one Chrome window. Group by the
      // actual native group so each window is ordered independently.
      const grouped = new Map();

      for (const itemId of orderedItemIds) {
        const tabId = Number(bindings[itemId]);
        if (!Number.isInteger(tabId)) continue;
        const tab = tabsById.get(tabId);
        if (!tab || tab.pinned || tab.groupId == null || tab.groupId === TAB_ID_NONE) continue;

        const key = `${tab.windowId}:${tab.groupId}`;
        if (!grouped.has(key)) grouped.set(key, []);
        grouped.get(key).push(tab);
      }

      for (const tabs of grouped.values()) {
        if (tabs.length < 2) continue;

        const desiredIds = tabs.map(tab => tab.id).filter(id => id != null);
        const currentIds = [...tabs]
          .sort((a, b) => a.index - b.index)
          .map(tab => tab.id)
          .filter(id => id != null);

        if (desiredIds.every((id, index) => id === currentIds[index])) continue;

        const firstIndex = Math.min(...tabs.map(tab => tab.index));
        try {
          await chrome.tabs.move(desiredIds, { index: firstIndex });
        } catch (error) {
          console.warn('Arc Side of the Chrome: native group ordering failed', error);
        }
      }
    }
  } finally {
    reorderRunning = false;
    if (reorderPending) {
      reorderPending = false;
      queueNativeGroupReorder(80);
    }
  }
}

function queueNativeGroupReorder(delay = 260) {
  if (reorderTimer) clearTimeout(reorderTimer);
  reorderTimer = setTimeout(() => {
    reorderTimer = null;
    reorderNativeGroupsNow().catch(error => {
      console.warn('Arc Side of the Chrome: native group ordering error', error);
    });
  }, delay);
}

chrome.runtime.onInstalled.addListener(() => queueNativeGroupReorder(500));
chrome.runtime.onStartup.addListener(() => queueNativeGroupReorder(1200));

chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'local' && changes[STORAGE_KEY]) queueNativeGroupReorder(220);
  if (area === 'session' && changes[BINDINGS_KEY]) queueNativeGroupReorder(220);
});

chrome.tabs.onCreated.addListener(() => queueNativeGroupReorder(450));
chrome.tabs.onReplaced.addListener(() => queueNativeGroupReorder(350));
chrome.tabs.onAttached.addListener(() => queueNativeGroupReorder(350));

queueNativeGroupReorder(500);
