// Capture Favorite ownership when a link opens. Its child is independent of
// the selected Space and must not inherit the parent's Chrome group.
export async function favoriteChildCandidate(tab, storage) {
  if (tab?.id == null || tab.openerTabId == null || tab.windowId == null) return null;
  const [local, session] = await Promise.all([
    storage.local.get('arcSidebarModel'),
    storage.session.get('arcSidebarBindings')
  ]);
  const model = local.arcSidebarModel;
  const bindings = session.arcSidebarBindings || {};
  const favoriteOpener = model?.favorites?.some(item => item.type === 'tab' && Number(bindings[item.id]) === tab.openerTabId);
  if (!favoriteOpener) return null;
  return { tabId: tab.id, windowId: tab.windowId, openerTabId: tab.openerTabId };
}

// Ungroup in the same serialized sync pass as saved-tab grouping. A child
// promoted to a saved item meanwhile keeps its explicit destination.
export function appendFavoriteChildrenToUngroup(ungrouped, candidates, bindings, tabsById) {
  const savedTabIds = new Set(Object.values(bindings).map(Number));
  for (const candidate of candidates) {
    const tab = tabsById.get(candidate.tabId);
    if (!tab || tab.pinned || tab.windowId !== candidate.windowId || savedTabIds.has(tab.id)) continue;
    if (!ungrouped.some(existing => existing.id === tab.id)) ungrouped.push(tab);
  }
}

// Run after group ordering, once for each newly created child. Recheck ownership
// so saving, pinning or moving a tab during sync wins over automatic placement.
export async function moveFavoriteChildrenToEnd(candidates, storage, browser = chrome) {
  if (!candidates.length) return;
  const session = await storage.session.get('arcSidebarBindings');
  const savedTabIds = new Set(Object.values(session.arcSidebarBindings || {}).map(Number));
  for (const candidate of candidates) {
    try {
      const tab = await browser.tabs.get(candidate.tabId);
      if (tab.pinned || tab.windowId !== candidate.windowId || savedTabIds.has(tab.id) || tab.groupId !== -1) continue;
      await browser.tabs.move(tab.id, { index: -1 });
    } catch { /* The child may have closed while groups were being synchronized. */ }
  }
}
