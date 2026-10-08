import { recalcModelStats } from '../shared/state-merge.js';
import { savedItemIds, spaceGroupIds } from '../shared/space-tabs.js';
import { bindingsReady, restoreSessionBindings, preserveWindowBindings } from './persistent-bindings.js';
import { serializeState } from './state-controller.js';
const MODEL = 'arcSidebarModel', STATE = 'arcSidebarState', BINDINGS = 'arcSidebarBindings';
function findSaved(model, id) {
  const walk = (nodes, spaceId, ancestors = []) => {
    for (const node of nodes || []) {
      if (node.type === 'tab' && node.id === id) return { item: node, spaceId, ancestors };
      if (node.type === 'folder') { const found = walk(node.children, spaceId, [...ancestors, node.id]); if (found) return found; }
    }
    return null;
  };
  const favorite = walk(model?.favorites, null);
  if (favorite) return favorite;
  for (const space of model?.spaces || []) { const found = walk(space.children, space.id); if (found) return found; }
  return null;
}
async function reveal(model, bindings, tabId, savedId) {
  const id = savedId || Object.keys(bindings).find(key => Number(bindings[key]) === tabId);
  const found = id && findSaved(model, id);
  if (!found?.spaceId) return;
  const stored = await chrome.storage.local.get(STATE);
  const state = { ...(stored[STATE] || {}), currentSpaceId: found.spaceId, collapsedFolders: { ...(stored[STATE]?.collapsedFolders || {}) } };
  for (const id of found.ancestors) state.collapsedFolders[id] = false;
  await chrome.storage.local.set({ [STATE]: state });
}
async function focus(tab) {
  if (tab.groupId != null && tab.groupId !== -1) { try { await chrome.tabGroups.update(tab.groupId, { collapsed: false }); } catch {} }
  await chrome.tabs.update(tab.id, { active: true });
  await chrome.windows.update(tab.windowId, { focused: true });
}
export async function activateTab(tabId) {
  await bindingsReady;
  return serializeState(async () => {
    const [local, session, tab] = await Promise.all([chrome.storage.local.get(MODEL), chrome.storage.session.get(BINDINGS), chrome.tabs.get(tabId)]);
    await focus(tab);
    await reveal(local[MODEL], session[BINDINGS] || {}, tab.id);
  });
}
export async function openSavedItem(itemId, windowId) {
  await bindingsReady;
  return serializeState(async () => {
    await restoreSessionBindings(itemId);
    const [local, session] = await Promise.all([chrome.storage.local.get(MODEL), chrome.storage.session.get(BINDINGS)]);
    const found = findSaved(local[MODEL], itemId);
    if (!found?.item.url) throw new Error('This sidebar item no longer exists.');
    const bindings = session[BINDINGS] || {};
    let tab;
    if (bindings[itemId] != null) { try { tab = await chrome.tabs.get(Number(bindings[itemId])); } catch {} }
    if (!tab) {
      tab = await chrome.tabs.create({ windowId, url: found.item.url, active: true });
      bindings[itemId] = tab.id;
      await chrome.storage.session.set({ [BINDINGS]: bindings });
    }
    await focus(tab);
    await reveal(local[MODEL], bindings, tab.id, itemId);
    return tab.id;
  });
}
export async function closeSavedItems(itemIds) {
  await bindingsReady;
  return serializeState(async () => {
    const session = await chrome.storage.session.get(BINDINGS);
    const bindings = session[BINDINGS] || {}, tabs = new Set();
    for (const id of itemIds) { if (bindings[id] != null) tabs.add(Number(bindings[id])); delete bindings[id]; }
    await chrome.storage.session.set({ [BINDINGS]: bindings });
    // A missing tab should not prevent the remaining tabs from closing.
    await Promise.allSettled([...tabs].map(id => chrome.tabs.remove(id)));
  });
}
async function spaceCloseTargets(spaceId) {
  const [local, session, tabs] = await Promise.all([
    chrome.storage.local.get(MODEL),
    chrome.storage.session.get([BINDINGS, 'arcSidebarNativeGroups']),
    chrome.tabs.query({})
  ]);
  const space = local[MODEL]?.spaces?.find(space => space.id === spaceId);
  if (!space) throw new Error('This Space no longer exists.');
  const bindings = session[BINDINGS] || {};
  const groupMap = session.arcSidebarNativeGroups || {};
  const results = await Promise.allSettled([...new Set(Object.values(groupMap))].map(id => chrome.tabGroups.get(id)));
  const groups = results.filter(result => result.status === 'fulfilled').map(result => result.value);
  const groupIds = spaceGroupIds(space, bindings, tabs, groupMap, groups);
  const live = new Set(tabs.map(tab => tab.id));
  const tabIds = new Set(savedItemIds(space.children).map(id => Number(bindings[id])).filter(id => live.has(id)));
  for (const tab of tabs) if (groupIds.has(tab.groupId)) tabIds.add(tab.id);
  return { tabIds: [...tabIds], bindings, groupCount: groupIds.size };
}
export async function getSpaceCloseInfo(spaceId) {
  await bindingsReady;
  return serializeState(async () => {
    const targets = await spaceCloseTargets(spaceId);
    return { count: targets.tabIds.length, groupCount: targets.groupCount };
  });
}
export async function closeSpaceTabs(spaceId) {
  await bindingsReady;
  return serializeState(async () => {
    // Refresh membership when clicked: include tabs opened since the menu and
    // leave tabs that have since moved out of the Space's groups untouched.
    const { tabIds, bindings } = await spaceCloseTargets(spaceId);
    const results = await Promise.allSettled(tabIds.map(id => chrome.tabs.remove(id)));
    const closed = new Set(tabIds.filter((_, i) => results[i].status === 'fulfilled'));
    for (const [id, tabId] of Object.entries(bindings)) if (closed.has(Number(tabId))) delete bindings[id];
    await chrome.storage.session.set({ [BINDINGS]: bindings });
    if (results.some(result => result.status === 'rejected')) throw new Error('Some tabs could not be closed. Reopen the Space menu to try again.');
  });
}
export function closeWindowGroup(windowId, groupId) {
  if (!Number.isInteger(groupId) || groupId < 0) return Promise.reject(new Error('Invalid Chrome group.'));
  return closeWindowTabs(windowId, groupId);
}
export async function closeWindowTabs(windowId, groupId = null) {
  await bindingsReady;
  return serializeState(async () => {
    if (!Number.isInteger(windowId) || windowId < 0) throw new Error('Invalid Chrome window.');
    if (groupId != null) {
      if (!Number.isInteger(groupId) || groupId < 0) throw new Error('Invalid Chrome group.');
      const group = await chrome.tabGroups.get(groupId);
      if (group.windowId !== windowId) throw new Error('This group is in another window.');
    }
    const tabs = (await chrome.tabs.query({ windowId })).filter(tab => tab.windowId === windowId && (groupId == null || tab.groupId === groupId));
    const session = await chrome.storage.session.get(BINDINGS);
    const bindings = session[BINDINGS] || {};
    const results = await Promise.allSettled(tabs.map(tab => chrome.tabs.remove(tab.id)));
    const closed = new Set(tabs.filter((_, index) => results[index].status === 'fulfilled').map(tab => tab.id));
    for (const [id, tabId] of Object.entries(bindings)) if (closed.has(Number(tabId))) delete bindings[id];
    await chrome.storage.session.set({ [BINDINGS]: bindings });
    if (results.some(result => result.status === 'rejected')) throw new Error('Some tabs could not be closed. Try again.');
    return { count: closed.size };
  });
}
function findNodeLocation(nodes, id) {
  for (let index = 0; index < (nodes || []).length; index++) {
    const node = nodes[index];
    if (node.id === id) return { node, parent: nodes, index };
    if (node.type === 'folder') { const found = findNodeLocation(node.children, id); if (found) return found; }
  }
  return null;
}
export async function pinWorkflowTab({ tabId, spaceId, targetNodeId, folderId, after = false }) {
  await bindingsReady;
  return serializeState(async () => {
    const { tabIds, bindings } = await spaceCloseTargets(spaceId);
    const local = await chrome.storage.local.get(MODEL);
    const model = local[MODEL];
    const saved = savedItemIds(model?.favorites);
    for (const space of model?.spaces || []) savedItemIds(space.children, saved);
    const existing = saved.find(id => Number(bindings[id]) === tabId);
    if (existing) return existing; // Concurrent drag/pin requests are idempotent.
    if (!tabIds.includes(tabId)) throw new Error('This tab is no longer in the Space.');
    const tab = await chrome.tabs.get(tabId);
    const url = tab.pendingUrl || tab.url;
    if (!url || !/^(https?:|file:)/i.test(url)) throw new Error('This page cannot be saved as a pinned link.');
    const space = model.spaces.find(space => space.id === spaceId);
    let parent = space.children ||= [], index = parent.length;
    if (targetNodeId) {
      const target = findNodeLocation(parent, targetNodeId);
      if (!target) throw new Error('The drop target changed. Drag the tab again.');
      parent = target.parent; index = target.index + (after ? 1 : 0);
    } else if (folderId) {
      const folder = findNodeLocation(parent, folderId)?.node;
      if (folder?.type !== 'folder') throw new Error('The folder no longer exists.');
      parent = folder.children ||= []; index = parent.length;
    }
    const item = { id: crypto.randomUUID(), type: 'tab', title: tab.title || url, url };
    parent.splice(index, 0, item);
    bindings[item.id] = tab.id;
    // Both values are resolved inside the shared queue; no stale UI model is saved.
    await chrome.storage.local.set({ [MODEL]: recalcModelStats(model) });
    await chrome.storage.session.set({ [BINDINGS]: bindings });
    return item.id;
  });
}
function updateTabBinding(removed, added) {
  return serializeState(async () => {
    const session = await chrome.storage.session.get(BINDINGS);
    const bindings = session[BINDINGS] || {};
    let changed = false;
    for (const [id, tabId] of Object.entries(bindings)) {
      if (Number(tabId) !== removed) continue;
      if (added == null) delete bindings[id]; else bindings[id] = added;
      changed = true;
    }
    if (changed) await chrome.storage.session.set({ [BINDINGS]: bindings });
  });
}
chrome.tabs.onRemoved.addListener((id, info) => {
  // Chrome emits removals while closing/restoring windows too. Keep the last
  // URL for restart recovery; explicit sidebar close clears it beforehand.
  if (info?.isWindowClosing) preserveWindowBindings(id);
  updateTabBinding(id).catch(console.warn);
});
chrome.tabs.onReplaced.addListener((added, removed) => updateTabBinding(removed, added).catch(console.warn));
chrome.runtime.onMessage.addListener((message, sender, respond) => {
  if (message?.type !== 'arc-sidebar-tab-action') return;
  if (sender.id !== chrome.runtime.id || !sender.url?.startsWith(chrome.runtime.getURL(''))) { respond({ ok: false, error: 'Invalid sidebar sender' }); return; }
  const action = message.action;
  const task = action === 'close-window-tabs' ? closeWindowTabs(message.windowId) : action === 'close-window-group' ? closeWindowGroup(message.windowId, message.groupId) : action === 'open' ? openSavedItem(message.itemId, message.windowId) : action === 'activate' ? activateTab(message.tabId) : action === 'close' ? closeSavedItems(message.itemIds || []) : action === 'space-close-info' ? getSpaceCloseInfo(message.spaceId) : action === 'close-space' ? closeSpaceTabs(message.spaceId) : action === 'pin-workflow-tab' ? pinWorkflowTab(message) : Promise.reject(new Error('Unknown tab action'));
  task.then(values => respond({ ok: true, values })).catch(error => respond({ ok: false, error: error.message }));
  return true;
});
