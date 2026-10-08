export function backupFolderState(model, state) {
  const collapsedFolders = {};
  const walk = nodes => {
    for (const node of nodes || []) {
      if (node.type !== 'folder') continue;
      collapsedFolders[node.id] = state?.collapsedFolders?.[node.id] === true;
      walk(node.children);
    }
  };
  for (const space of model.spaces || []) walk(space.children);
  return { collapsedFolders };
}
