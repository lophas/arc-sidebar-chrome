export function savedItemIds(nodes, out = []) {
  for (const node of nodes || []) {
    if (node.type === 'tab') out.push(node.id);
    if (node.type === 'folder') savedItemIds(node.children, out);
  }
  return out;
}
export function spaceGroupIds(space, bindings, tabs, groupMap, groups) {
  const byId = new Map(tabs.map(tab => [tab.id, tab]));
  const ids = new Set();
  for (const id of savedItemIds(space?.children)) {
    const tab = byId.get(Number(bindings[id]));
    if (tab?.groupId != null && tab.groupId !== -1) ids.add(tab.groupId);
  }
  const byGroup = new Map(groups.map(group => [group.id, group]));
  for (const [key, id] of Object.entries(groupMap || {})) {
    const colon = key.indexOf(':');
    if (colon < 0 || key.slice(colon + 1) !== space?.id) continue;
    const group = byGroup.get(id);
    if (group && group.windowId === Number(key.slice(0, colon)) && group.title === space.title) ids.add(id);
  }
  return ids;
}
export function spaceWorkflowTabs(model, space, bindings, tabs, groupMap, groups, windowId) {
  if (!space) return [];
  const groupIds = spaceGroupIds(space, bindings, tabs, groupMap, groups);
  const saved = savedItemIds(model?.favorites);
  for (const candidate of model?.spaces || []) savedItemIds(candidate.children, saved);
  const boundIds = new Set(saved.map(id => Number(bindings[id])).filter(Number.isInteger));
  return tabs.filter(tab => !tab.pinned && groupIds.has(tab.groupId) && !boundIds.has(tab.id))
    .sort((a, b) => Number(b.windowId === windowId) - Number(a.windowId === windowId)
      || a.windowId - b.windowId || a.index - b.index);
}
