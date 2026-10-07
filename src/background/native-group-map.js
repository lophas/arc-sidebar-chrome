// A group with workflow tabs remains associated with its Space even when no
// pinned tab is open. Chrome deletes the group when its final tab closes.
export async function pruneGroupMap(map, desiredKeys, model, favoritesGroup) {
  let changed = false;
  for (const [key, groupId] of Object.entries(map)) {
    if (desiredKeys.has(key)) continue;
    const colon = key.indexOf(':');
    const spaceId = key.slice(colon + 1);
    const space = model?.spaces?.find(space => space.id === spaceId)
      || (favoritesGroup?.id === spaceId ? favoritesGroup : null);
    let valid = false;
    if (space && colon >= 0) {
      try {
        const group = await chrome.tabGroups.get(groupId);
        valid = group.windowId === Number(key.slice(0, colon)) && group.title === space.title;
      } catch {}
    }
    if (!valid) { delete map[key]; changed = true; }
  }
  return changed;
}
