export function navigationUrl(value) {
  const text = value.trim();
  if (/^(https?|chrome|file):\/\//i.test(text)) {
    try {
      const url = new URL(text);
      if (url.protocol === 'chrome:' && !url.pathname) url.pathname = '/';
      return url.href;
    } catch { return null; }
  }
  if (/^(localhost|(?:[\p{L}\d-]+\.)+[\p{L}\d-]+)(?::\d+)?(?:[/?#][^\s]*)?$/u.test(text)) {
    try { return new URL(`https://${text}`).href; } catch {}
  }
  return null;
}
const normalize = text => String(text || '').normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();

export function searchableTabUrl(value) {
  try {
    const url = new URL(value);
    if (!['http:', 'https:', 'file:', 'chrome:'].includes(url.protocol)) return false;
    return url.protocol !== 'chrome:' || !/^newtab$|^new-tab-page(?:-|$)/i.test(url.hostname);
  } catch { return false; }
}

// Match saved links to their actual live bindings, never by URL: two tabs with
// the same URL are still two separate destinations, even after navigation.
export function buildSearchData({ model, bindings = {}, tabs = [], groups = [], windowId, sourceTabId }) {
  const groupNames = new Map(groups.map(group => [group.id, group.title || 'Unnamed group']));
  const allTabs = new Map(tabs.map(tab => [tab.id, tab]));
  const live = tabs.filter(tab => tab.id >= 0 && !tab.pinned && searchableTabUrl(tab.pendingUrl || tab.url))
    .sort((a, b) => (b.lastAccessed || 0) - (a.lastAccessed || 0))
    .map(tab => ({ kind: 'Open tab', tabId: tab.id, isSource: tab.id === sourceTabId,
      lastAccessed: tab.lastAccessed || 0, title: tab.title || tab.pendingUrl || tab.url,
      url: tab.pendingUrl || tab.url, favIconUrl: tab.favIconUrl,
      detail: [tab.groupId >= 0 ? groupNames.get(tab.groupId) || 'Unnamed group' : 'Ungrouped',
        ...(tab.windowId !== windowId ? ['Other window'] : []), tab.pendingUrl || tab.url].join(' / ') }));
  const byTabId = new Map(live.map(item => [item.tabId, item]));
  const saved = [];
  const walk = (nodes, space, ancestors = [], path = []) => {
    for (const node of nodes || []) {
      const location = [space.title, ...path].join(' / ');
      if (node.type === 'folder') {
        saved.push({ kind: 'Folder', id: node.id, spaceId: space.id, ancestors,
          title: node.title || 'Untitled folder', detail: location });
        walk(node.children, space, [...ancestors, node.id], [...path, node.title]);
      } else if (node.type === 'tab' && node.url) {
        const boundTabId = Number(bindings[node.id]);
        if (allTabs.get(boundTabId)?.pinned) continue;
        const open = byTabId.get(boundTabId);
        if (open) {
          open.searchText = [open.searchText || '', node.title, node.url, location].join(' ');
          open.detail = `${location} / ${open.detail}`;
          open.favIconUrl = node.icon || open.favIconUrl || node.favIconUrl;
        } else {
          saved.push({ ...node, kind: space.id ? 'Pinned' : 'Favorite', spaceId: space.id, ancestors,
            title: node.title || node.url, favIconUrl: node.icon || node.favIconUrl,
            detail: `${location} / ${node.url}` });
        }
      }
    }
  };
  walk(model?.favorites, { title: 'Favorites' });
  for (const space of model?.spaces || []) {
    saved.push({ kind: 'Space', spaceId: space.id, title: space.title || 'Untitled Space' });
    walk(space.children, space);
  }
  return [...live, ...saved];
}

export function buildResults(data, value) {
  const text = value.trim(), q = normalize(text), tokens = q.split(/\s+/).filter(Boolean);
  if (!text) return data.filter(item => item.kind === 'Open tab' && !item.isSource).sort((a, b) => (b.lastAccessed || 0) - (a.lastAccessed || 0)).slice(0, 30);
  const results = data.filter(item => tokens.every(token => normalize(`${item.title} ${item.url || ''} ${item.detail || ''} ${item.searchText || ''}`).includes(token)))
    .map((item, index) => ({ item, index, score: normalize(item.title) === q ? 3 : normalize(item.title).startsWith(q) ? 2 : 1 }))
    .sort((a, b) => b.score - a.score || a.index - b.index).slice(0, 30).map(x => x.item);
  if (text) {
    const url = navigationUrl(text);
    if (url) {
      const existing = data.find(item => item.kind === 'Open tab' && navigationUrl(item.url) === url);
      if (existing) {
        const index = results.indexOf(existing);
        if (index >= 0) results.splice(index, 1);
        results.unshift(existing);
      } else results.unshift({ kind: 'URL', title: `Open ${text}`, url });
    }
    results.push({ kind: 'Search', title: `Search Google for “${text}”`, url: `https://www.google.com/search?q=${encodeURIComponent(text)}` });
  }
  return results;
}
