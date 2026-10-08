// Capture the selected Space when the child opens, before subsequent navigation
// or Space selection can change the destination of a background-opened link.
export async function favoriteChildDestination(tab, storage) {
  if (tab?.id == null || tab.openerTabId == null || tab.windowId == null) return null;
  const [local, session] = await Promise.all([
    storage.local.get(['arcSidebarModel', 'arcSidebarState']),
    storage.session.get('arcSidebarBindings')
  ]);
  const model = local.arcSidebarModel;
  const spaceId = local.arcSidebarState?.currentSpaceId;
  if (!spaceId || spaceId === '__open_tabs__' || !model?.spaces?.some(space => space.id === spaceId)) return null;
  const bindings = session.arcSidebarBindings || {};
  const favoriteOpener = model.favorites?.some(item => item.type === 'tab' && Number(bindings[item.id]) === tab.openerTabId);
  if (!favoriteOpener) return null;
  return { tabId: tab.id, windowId: tab.windowId, spaceId };
}

// Add workflow children to the same serialized group-sync pass as saved tabs.
// A child promoted to a saved item meanwhile keeps its explicit destination.
export function appendFavoriteChildren(desired, candidates, model, bindings, tabsById) {
  const savedTabIds = new Set(Object.values(bindings).map(Number));
  for (const candidate of candidates) {
    const tab = tabsById.get(candidate.tabId);
    const space = model?.spaces?.find(space => space.id === candidate.spaceId);
    if (!tab || !space || tab.windowId !== candidate.windowId || savedTabIds.has(tab.id)) continue;
    const key = `${tab.windowId}:${space.id}`;
    if (!desired.has(key)) desired.set(key, { windowId: tab.windowId, space, tabs: [] });
    const entry = desired.get(key);
    if (!entry.tabs.some(existing => existing.id === tab.id)) entry.tabs.push(tab);
  }
}
