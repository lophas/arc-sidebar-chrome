const STORAGE_KEY = 'arcSidebarModel';
const BINDINGS_KEY = 'arcSidebarBindings';
const MENU_ROOT_ID = 'arc-sidebar-pin-root';
const MENU_SPACE_PREFIX = 'arc-sidebar-pin-space:';

function uid() {
  return crypto.randomUUID
    ? crypto.randomUUID()
    : `context-tab-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function recalcStats(model) {
  const stats = {
    spaces: model.spaces?.length || 0,
    folders: 0,
    tabs: 0,
    favorites: model.favorites?.length || 0
  };

  const walk = nodes => {
    for (const node of nodes || []) {
      if (node?.type === 'tab') stats.tabs += 1;
      if (node?.type === 'folder') {
        stats.folders += 1;
        walk(node.children || []);
      }
    }
  };

  for (const space of model.spaces || []) walk(space.children || []);
  model.stats = stats;
}

function spaceMenuId(spaceId) {
  return `${MENU_SPACE_PREFIX}${encodeURIComponent(spaceId)}`;
}

function spaceIdFromMenuId(menuItemId) {
  const value = String(menuItemId || '');
  if (!value.startsWith(MENU_SPACE_PREFIX)) return null;
  try {
    return decodeURIComponent(value.slice(MENU_SPACE_PREFIX.length));
  } catch {
    return null;
  }
}

function createMenuItem(options) {
  return new Promise(resolve => {
    chrome.contextMenus.create(options, () => {
      void chrome.runtime.lastError;
      resolve();
    });
  });
}

async function rebuildPinContextMenu() {
  try {
    await chrome.contextMenus.removeAll();
    const stored = await chrome.storage.local.get(STORAGE_KEY);
    const model = stored[STORAGE_KEY];
    const spaces = model?.spaces || [];

    await createMenuItem({
      id: MENU_ROOT_ID,
      title: spaces.length ? 'Pin to Arc Sidebar' : 'Pin to Arc Sidebar (no Spaces)',
      contexts: ['page', 'link'],
      enabled: spaces.length > 0
    });

    for (const space of spaces) {
      if (!space?.id) continue;
      const icon = space.emoji || '•';
      const title = space.title || 'Untitled Space';
      await createMenuItem({
        id: spaceMenuId(space.id),
        parentId: MENU_ROOT_ID,
        title: `${icon} ${title}`,
        contexts: ['page', 'link']
      });
    }
  } catch (error) {
    console.warn('Arc Sidebar: context menu rebuild failed', error);
  }
}

async function pinFromContextMenu(info, tab) {
  const spaceId = spaceIdFromMenuId(info.menuItemId);
  if (!spaceId) return;

  const stored = await chrome.storage.local.get(STORAGE_KEY);
  const model = stored[STORAGE_KEY];
  const space = model?.spaces?.find(candidate => candidate.id === spaceId);
  if (!space) return;

  const targetUrl = info.linkUrl || info.pageUrl || tab?.url || '';
  if (!/^https?:\/\//i.test(targetUrl)) return;

  const isCurrentPage = !info.linkUrl && tab?.url === targetUrl;
  const title = isCurrentPage
    ? (tab?.title || targetUrl)
    : targetUrl;

  const item = {
    type: 'tab',
    id: uid(),
    title,
    url: targetUrl
  };

  space.children ||= [];
  space.children.push(item);
  recalcStats(model);

  const writes = [chrome.storage.local.set({ [STORAGE_KEY]: model })];

  if (isCurrentPage && tab?.id != null) {
    const session = await chrome.storage.session.get(BINDINGS_KEY);
    const bindings = session[BINDINGS_KEY] || {};
    bindings[item.id] = tab.id;
    writes.push(chrome.storage.session.set({ [BINDINGS_KEY]: bindings }));
  }

  await Promise.all(writes);
}

chrome.runtime.onInstalled.addListener(() => {
  rebuildPinContextMenu();
});

chrome.runtime.onStartup.addListener(() => {
  rebuildPinContextMenu();
});

chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'local' && changes[STORAGE_KEY]) rebuildPinContextMenu();
});

chrome.contextMenus.onClicked.addListener((info, tab) => {
  pinFromContextMenu(info, tab).catch(error => {
    console.warn('Arc Sidebar: context-menu pin failed', error);
  });
});

rebuildPinContextMenu();
