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
  const task = action === 'open' ? openSavedItem(message.itemId, message.windowId) : action === 'activate' ? activateTab(message.tabId) : action === 'close' ? closeSavedItems(message.itemIds || []) : Promise.reject(new Error('Unknown tab action'));
  task.then(() => respond({ ok: true })).catch(error => respond({ ok: false, error: error.message }));
  return true;
});
