// The generated starting layout is a local placeholder, never a cloud snapshot.
// Empty user-created folders and customized Spaces are intentional organization.
export function hasSyncContent(model) {
  if (!model || typeof model !== 'object') return false;
  if ((model.favorites || []).some(item => item?.type === 'tab' && String(item.url || '').trim())) return true;
  const spaces = model.spaces || [];
  if (spaces.length > 1) return true;
  return spaces.some(space => {
    if ((space.children || []).some(node => node?.type === 'folder' || (node?.type === 'tab' && String(node.url || '').trim()))) return true;
    return space.id !== '__my_space__' || space.title !== 'My Space' || space.emoji !== '🚀' || Boolean(space.icon || space.color);
  });
}
