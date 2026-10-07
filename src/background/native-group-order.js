// Move entire groups, including workflow tabs, without changing their contents.
export async function orderNativeGroups(model, groupMap, favoritesGroup) {
  const spaces = [favoritesGroup, ...(model?.spaces || [])].filter(Boolean);
  const groups = await chrome.tabGroups.query({});
  const byId = new Map(groups.map(group => [group.id, group]));
  const windows = new Set(groups.map(group => group.windowId));
  for (const windowId of windows) {
    const ordered = [];
    for (const space of spaces) {
      const group = byId.get(groupMap[`${windowId}:${space.id}`]);
      if (group?.windowId === windowId && group.title === space.title && !ordered.includes(group.id)) ordered.push(group.id);
    }
    if (ordered.length < 2) continue;
    let tabs = await chrome.tabs.query({ windowId });
    const managed = new Set(ordered);
    let cursor = Math.min(...tabs.filter(tab => managed.has(tab.groupId)).map(tab => tab.index));
    if (!Number.isFinite(cursor)) continue;
    for (const groupId of ordered) {
      // Every move shifts other groups' indices. Read fresh positions rather
      // than computing later targets from the original tab strip.
      tabs = await chrome.tabs.query({ windowId });
      const members = tabs.filter(tab => tab.groupId === groupId);
      if (!members.length) continue;
      const first = Math.min(...members.map(tab => tab.index));
      if (first !== cursor) await chrome.tabGroups.move(groupId, { index: cursor });
      cursor += members.length;
    }
  }
}
