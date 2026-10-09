import { ensureEmptySidebar } from './empty-sidebar.js';
import { createStorageClient } from '../shared/storage-client.js';
import { commitStorage } from './state-controller.js';
const sidebarStorage = createStorageClient({ transact: commitStorage });
import './group-order.js';
import './native-panel-reload.js';

const STORAGE_KEY = 'arcSidebarModel';
const BINDINGS_KEY = 'arcSidebarBindings';
const MENU_ROOT_ID = 'arc-sidebar-pin-root';
const MENU_FAVORITES_ID = 'arc-sidebar-pin-favorites';
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

let menuRebuild = Promise.resolve();
function rebuildPinContextMenu() {
  menuRebuild = menuRebuild.then(rebuildPinContextMenuNow);
  return menuRebuild;
}
async function rebuildPinContextMenuNow() {
  try {
    await ensureEmptySidebar();
    await chrome.contextMenus.removeAll();
    const stored = await sidebarStorage.local.get(STORAGE_KEY);
    const model = stored[STORAGE_KEY];
    const spaces = model?.spaces || [];

    await createMenuItem({
      id: MENU_ROOT_ID,
      title: 'Pin to Arc Side of the Chrome',
      contexts: ['page', 'link'],
      enabled: true
    });

    await createMenuItem({ id: MENU_FAVORITES_ID, parentId: MENU_ROOT_ID, title: '★ Favorites', contexts: ['page', 'link'] });

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
    console.warn('Arc Side of the Chrome: context menu rebuild failed', error);
  }
}

async function pinFromContextMenu(info, tab) {
  const spaceId = spaceIdFromMenuId(info.menuItemId);
  const isFavorite = info.menuItemId === MENU_FAVORITES_ID;
  if (!spaceId && !isFavorite) return;

  await ensureEmptySidebar();
  const stored = await sidebarStorage.local.get(STORAGE_KEY);
  const model = stored[STORAGE_KEY];
  const space = model?.spaces?.find(candidate => candidate.id === spaceId);
  if (!model || (!isFavorite && !space)) return;

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

  const destination = isFavorite ? (model.favorites ||= []) : (space.children ||= []);
  destination.push(item);
  recalcStats(model);

  const writes = { local: { [STORAGE_KEY]: model } };

  if (isCurrentPage && tab?.id != null) {
    const session = await sidebarStorage.session.get(BINDINGS_KEY);
    const bindings = session[BINDINGS_KEY] || {};
    bindings[item.id] = tab.id;
    writes.session = { [BINDINGS_KEY]: bindings };
  }

  await sidebarStorage.transaction(writes);
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
    console.warn('Arc Side of the Chrome: context-menu pin failed', error);
  });
});

rebuildPinContextMenu();
