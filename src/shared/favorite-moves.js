function locate(nodes, id) {
  for (let index = 0; index < (nodes || []).length; index++) {
    const node = nodes[index];
    if (node.id === id) return { node, parent: nodes, index };
    if (node.type === 'folder') {
      const found = locate(node.children, id);
      if (found) return found;
    }
  }
  return null;
}

// Validate the destination before removing the Favorite. Keep the saved ID and
// every item field so its live-tab binding and custom icon follow the move.
export function moveFavoriteToSpace(model, itemId, spaceId, { targetNodeId, folderId, after = false } = {}) {
  const sourceIndex = model?.favorites?.findIndex(item => item.id === itemId && item.type === 'tab') ?? -1;
  const space = model?.spaces?.find(item => item.id === spaceId);
  if (sourceIndex < 0 || !space || spaceId === '__open_tabs__') return false;
  let destination = space.children || [];
  let index = destination.length;
  if (targetNodeId) {
    const target = locate(space.children, targetNodeId);
    if (!target) return false;
    destination = target.parent;
    index = target.index + Number(after);
  } else if (folderId) {
    const folder = locate(space.children, folderId)?.node;
    if (folder?.type !== 'folder') return false;
    destination = folder.children ||= [];
    index = destination.length;
  }
  const [moved] = model.favorites.splice(sourceIndex, 1);
  space.children ||= destination;
  destination.splice(index, 0, moved);
  return true;
}
