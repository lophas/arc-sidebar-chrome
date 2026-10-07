import { bindingsReady } from './persistent-bindings.js';
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
function savedItemIds(nodes, out = []) {
  for (const node of nodes || []) {
    if (node.type === 'tab') out.push(node.id);
    if (node.type === 'folder') savedItemIds(node.children, out);
  }
  return out;
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
  const byId = new Map(tabs.map(tab => [tab.id, tab]));
  const groupIds = new Set(), tabIds = new Set();
  for (const id of savedItemIds(space.children)) {
    const tab = byId.get(Number(bindings[id]));
    if (!tab) continue;
    tabIds.add(tab.id);
    if (tab.groupId != null && tab.groupId !== -1) groupIds.add(tab.groupId);
  }
  // Keep workflow-only groups reachable even after their last pinned tab closes.
  for (const [key, groupId] of Object.entries(session.arcSidebarNativeGroups || {})) {
    const colon = key.indexOf(':');
    if (key.slice(colon + 1) !== spaceId || colon < 0) continue;
    try {
      const group = await chrome.tabGroups.get(groupId);
      if (group.windowId === Number(key.slice(0, colon)) && group.title === space.title) groupIds.add(groupId);
    } catch {}
  }
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
chrome.tabs.onRemoved.addListener(id => updateTabBinding(id).catch(console.warn));
chrome.tabs.onReplaced.addListener((added, removed) => updateTabBinding(removed, added).catch(console.warn));
chrome.runtime.onMessage.addListener((message, sender, respond) => {
  if (message?.type !== 'arc-sidebar-tab-action') return;
  if (sender.id !== chrome.runtime.id || !sender.url?.startsWith(chrome.runtime.getURL(''))) { respond({ ok: false, error: 'Invalid sidebar sender' }); return; }
  const action = message.action;
  const task = action === 'open' ? openSavedItem(message.itemId, message.windowId) : action === 'activate' ? activateTab(message.tabId) : action === 'close' ? closeSavedItems(message.itemIds || []) : action === 'space-close-info' ? getSpaceCloseInfo(message.spaceId) : action === 'close-space' ? closeSpaceTabs(message.spaceId) : Promise.reject(new Error('Unknown tab action'));
  task.then(values => respond({ ok: true, values })).catch(error => respond({ ok: false, error: error.message }));
  return true;
});
