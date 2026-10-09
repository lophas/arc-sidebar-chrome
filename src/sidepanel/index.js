import { createFavicon } from '../shared/favicon.js';
import { groupOpenTabs } from '../shared/open-tab-groups.js';
import { spaceWorkflowTabs } from '../shared/space-tabs.js';
import { isSidebarActive } from './lifecycle.js';
import { sidebarTabAction } from './tab-actions.js';
import { createStorageClient } from '../shared/storage-client.js';
const sidebarStorage = createStorageClient({ isActive: isSidebarActive });
const STORAGE_KEY = 'arcSidebarModel';
const STATE_KEY = 'arcSidebarState';
const BINDINGS_KEY = 'arcSidebarBindings';
const GROUP_MAP_KEY = 'arcSidebarNativeGroups';
const OPEN_TABS_SPACE_ID = '__open_tabs__';
const TAB_ID_NONE = -1;
const TAB_REFRESH_DELAY = 50;

const els = {
  arcFile: document.querySelector('#arcFile'),
  spaces: document.querySelector('#spaces'),
  favoritesSection: document.querySelector('#favoritesSection'),
  favorites: document.querySelector('#favorites'),
  pinnedSection: document.querySelector('#pinnedSection'),
  pinned: document.querySelector('#pinned'),
  openSection: document.querySelector('#openSection'),
  openTabs: document.querySelector('#openTabs'),
  openCount: document.querySelector('#openCount'),
  stats: document.querySelector('#stats'),
  search: document.querySelector('#search'),
  emptyTemplate: document.querySelector('#emptyTemplate')
};

let model = null;
let state = { currentSpaceId: null, collapsedFolders: {} };
let bindings = {};
let openTabs = [];
let allTabs = [];
let nativeGroups = [];
let nativeGroupMap = {};
let currentWindowId = null;
let tabsById = new Map();
let refreshTimer = null;
let refreshRunning = false;
let refreshPending = false;
let renderFrame = null;

function pairArray(arr = []) {
  const out = new Map();
  for (let i = 0; i + 1 < arr.length; i += 2) {
    if (typeof arr[i] === 'string' && arr[i + 1] && typeof arr[i + 1] === 'object') {
      out.set(arr[i], arr[i + 1]);
    }
  }
  return out;
}

function getSidebarContainer(json) {
  const containers = json?.sidebar?.containers;
  if (!Array.isArray(containers)) throw new Error('Not a recognized Arc StorableSidebar.json file.');
  const container = containers.find(x => Array.isArray(x?.spaces) && Array.isArray(x?.items));
  if (!container) throw new Error('Arc Spaces/items container was not found.');
  return container;
}

function getPinnedContainerId(space) {
  const ids = Array.isArray(space?.containerIDs) ? space.containerIDs : [];
  const index = ids.indexOf('pinned');
  return index >= 0 ? ids[index + 1] : null;
}

function translateArcInternalUrl(url) {
  if (!url?.startsWith('arc://')) return url || '';
  if (url.startsWith('arc://downloads')) return 'chrome://downloads/';
  if (url.startsWith('arc://history')) return 'chrome://history/';
  if (url.startsWith('arc://password-manager')) return 'chrome://password-manager/passwords';
  if (url.startsWith('arc://settings')) return 'chrome://settings/';
  return '';
}

function recalcStats(targetModel) {
  const stats = {
    spaces: targetModel?.spaces?.length || 0,
    folders: 0,
    tabs: 0,
    favorites: targetModel?.favorites?.length || 0
  };

  const walk = nodes => {
    for (const node of nodes || []) {
      if (node.type === 'tab') stats.tabs += 1;
      if (node.type === 'folder') {
        stats.folders += 1;
        walk(node.children || []);
      }
    }
  };

  for (const space of targetModel?.spaces || []) walk(space.children || []);
  targetModel.stats = stats;
  return targetModel;
}

function parseArcSidebar(json) {
  const container = getSidebarContainer(json);
  const items = pairArray(container.items);
  const spacesMap = pairArray(container.spaces);

  const parseItem = (id, seen = new Set()) => {
    if (!id || seen.has(id)) return null;
    seen.add(id);
    const raw = items.get(id);
    if (!raw) return null;

    if (raw?.data?.tab) {
      const tab = raw.data.tab;
      const url = translateArcInternalUrl(tab.savedURL || '');
      if (!url) return null;
      return {
        type: 'tab',
        id,
        title: raw.title || tab.savedTitle || url,
        url
      };
    }

    if (raw?.data?.list) {
      const children = (raw.childrenIds || [])
        .map(childId => parseItem(childId, new Set(seen)))
        .filter(Boolean);
      return {
        type: 'folder',
        id,
        title: raw.title || 'Untitled folder',
        children
      };
    }

    return null;
  };

  const spaces = [];
  for (const [spaceId, space] of spacesMap.entries()) {
    const pinnedContainerId = getPinnedContainerId(space);
    const pinnedContainer = pinnedContainerId ? items.get(pinnedContainerId) : null;
    const children = (pinnedContainer?.childrenIds || [])
      .map(id => parseItem(id))
      .filter(Boolean);

    spaces.push({
      id: spaceId,
      title: space.title || 'Untitled Space',
      emoji: space?.customInfo?.iconType?.emoji_v2 || '',
      children
    });
  }

  let favorites = [];
  const defaultTopAppsContainer = [...items.values()].find(raw =>
    raw?.data?.itemContainer?.containerType?.topApps?._0?.default === true
  );
  if (defaultTopAppsContainer) {
    favorites = (defaultTopAppsContainer.childrenIds || [])
      .map(id => parseItem(id))
      .filter(item => item?.type === 'tab');
  }

  return recalcStats({
    version: 2,
    importedAt: new Date().toISOString(),
    favorites,
    spaces,
    stats: null
  });
}

function domainFor(url) {
  try { return new URL(url).hostname.replace(/^www\./, ''); }
  catch { return ''; }
}



async function saveState(patch = state) {
  await sidebarStorage.local.patch(STATE_KEY, patch);
}

function normalizeState() {
  const validSpace = state.currentSpaceId === OPEN_TABS_SPACE_ID || model?.spaces?.some(space => space.id === state.currentSpaceId);
  if (model?.spaces?.length && !validSpace) state.currentSpaceId = model.spaces[0].id;
}

async function loadData() {
  const { local: stored, session } = await sidebarStorage.snapshot({
    local: [STORAGE_KEY, STATE_KEY], session: [BINDINGS_KEY, GROUP_MAP_KEY]
  });
  model = stored[STORAGE_KEY] || null;
  state = { currentSpaceId: null, collapsedFolders: {}, ...(stored[STATE_KEY] || {}) };
  bindings = session[BINDINGS_KEY] || {};
  nativeGroupMap = session[GROUP_MAP_KEY] || {};
  normalizeState();
}

function collectSavedItemIds() {
  const ids = new Set();
  for (const item of model?.favorites || []) {
    if (item?.type === 'tab' && item.id) ids.add(item.id);
  }
  const walk = nodes => {
    for (const node of nodes || []) {
      if (node.type === 'tab' && node.id) ids.add(node.id);
      if (node.type === 'folder') walk(node.children || []);
    }
  };
  for (const space of model?.spaces || []) walk(space.children || []);
  return ids;
}

function boundTabFor(itemId) {
  const tabId = bindings[itemId];
  const tab = tabId == null ? null : tabsById.get(Number(tabId));
  return tab?.pinned ? null : tab || null;
}

async function expandAndActivateTab(tabId) { await sidebarTabAction('activate', { tabId }); }

async function refreshOpenTabsNow() {
  if (!isSidebarActive()) return;
  if (refreshRunning) {
    refreshPending = true;
    return;
  }
  refreshRunning = true;
  try {
    let windowInfo;
    [openTabs, allTabs, nativeGroups, windowInfo] = await Promise.all([
      chrome.tabs.query({ currentWindow: true }),
      chrome.tabs.query({}),
      chrome.tabGroups.query({}),
      chrome.windows.getCurrent()
    ]);
    currentWindowId = windowInfo.id;
    tabsById = new Map(allTabs.filter(tab => tab.id != null).map(tab => [tab.id, tab]));
    render();
  } finally {
    refreshRunning = false;
    if (refreshPending) {
      refreshPending = false;
      scheduleTabRefresh(0);
    }
  }
}

function scheduleTabRefresh(delay = TAB_REFRESH_DELAY) {
  if (!isSidebarActive()) return;
  if (refreshTimer) clearTimeout(refreshTimer);
  refreshTimer = setTimeout(() => {
    refreshTimer = null;
    refreshOpenTabsNow().catch(error => console.error('Arc Side of the Chrome: tab refresh failed', error));
  }, delay);
}

async function focusOrOpen(saved) {
  if (!saved?.id || !saved?.url) return;
  await sidebarTabAction('open', { itemId: saved.id });
  scheduleTabRefresh(0);
}
async function resetSavedTab(saved) {
  if (!saved?.id) return;
  await sidebarTabAction('close', { itemIds: [saved.id] });
  scheduleTabRefresh(0);
}

function currentSpace() {
  if (state.currentSpaceId === OPEN_TABS_SPACE_ID) return null;
  return model?.spaces?.find(space => space.id === state.currentSpaceId) || model?.spaces?.[0] || null;
}

function matchesSearch(node, q) {
  if (!q) return true;
  const haystack = `${node.title || ''} ${node.url || ''}`.toLowerCase();
  if (haystack.includes(q)) return true;
  return node.type === 'folder' && (node.children || []).some(child => matchesSearch(child, q));
}

function createTabRow(item, { live = false, active = false, boundTab = null } = {}) {
  const row = document.createElement('div');
  if (!live && item.id) row.dataset.savedNodeId = item.id;
  row.className = `row${active ? ' active' : ''}${boundTab ? ' has-binding' : ''}`;
  row.title = item.url || item.title || '';
  if (live && item.id != null) row.dataset.liveTabId = String(item.id);

  const favicon = createFavicon({ url: live ? item.url : boundTab?.url || item.url, faviconUrl: live ? item.favIconUrl : boundTab?.favIconUrl });

  const title = document.createElement('span');
  title.className = 'row-title';
  title.textContent = item.title || item.url || 'Untitled';

  const domain = document.createElement('span');
  domain.className = 'row-domain';
  domain.textContent = domainFor(item.url);
  row.append(favicon, title, domain);

  if (live) {
    const close = document.createElement('button');
    close.className = `close-tab live-dot-close${item.discarded ? ' discarded-tab' : ''}`;
    close.type = 'button';
    close.textContent = '';
    close.title = 'Close tab';
    close.addEventListener('click', async event => {
      event.stopPropagation();
      if (item.id != null) await sidebarTabAction('close-live-tab', { tabId: item.id }).catch(() => {});
    });
    row.append(close);
    row.addEventListener('click', () => {
      if (item.id != null) expandAndActivateTab(item.id).catch(() => {});
    });
  } else {
    if (boundTab) {
      const reset = document.createElement('button');
      reset.className = `reset-pinned live-dot-close${boundTab.discarded ? ' discarded-tab' : ''}`;
      reset.type = 'button';
      reset.textContent = '';
      reset.title = 'Close';
      reset.setAttribute('aria-label', `Close ${item.title || 'pinned tab'}`);
      reset.addEventListener('click', async event => {
        event.preventDefault();
        event.stopPropagation();
        await resetSavedTab(item);
      });
      row.append(reset);
    }
    row.addEventListener('click', () => focusOrOpen(item));
  }

  return row;
}

function renderNode(node, q) {
  if (!matchesSearch(node, q)) return null;
  if (node.type === 'tab') {
    const boundTab = boundTabFor(node.id);
    return createTabRow(node, { active: Boolean(boundTab?.active), boundTab });
  }

  if (node.type !== 'folder') return null;

  const folder = document.createElement('div');
  folder.className = 'folder';
  folder.dataset.folderNodeId = node.id;
  if (state.collapsedFolders[node.id] && !q) folder.classList.add('collapsed');

  const header = document.createElement('div');
  header.className = 'folder-header';
  header.dataset.folderNodeId = node.id;
  const caret = document.createElement('span');
  caret.className = 'folder-caret';
  caret.textContent = folder.classList.contains('collapsed') ? '▶' : '▼';
  const title = document.createElement('span');
  title.className = 'row-title';
  title.textContent = node.title;
  header.append(caret, title);

  const children = document.createElement('div');
  children.className = 'folder-children';
  for (const child of node.children || []) {
    const rendered = renderNode(child, q);
    if (rendered) children.append(rendered);
  }

  header.addEventListener('click', async () => {
    state.collapsedFolders[node.id] = !folder.classList.contains('collapsed');
    await saveState({ collapsedFolders: { [node.id]: state.collapsedFolders[node.id] } });
    render();
  });

  folder.append(header, children);
  return folder;
}

function renderFavorites() {
  els.favorites.replaceChildren();
  const favorites = model?.favorites || [];
  els.favoritesSection.classList.toggle('hidden', favorites.length === 0);

  for (const item of favorites) {
    const tile = document.createElement('button');
    tile.type = 'button';
    tile.className = 'favorite-tile';
    tile.dataset.favoriteId = item.id;
    tile.title = item.title || item.url;

    const matchingTab = boundTabFor(item.id);
    if (matchingTab?.active) tile.classList.add('active');
    if (matchingTab) tile.classList.add('has-binding');

    const favicon = createFavicon({ url: matchingTab?.url || item.url, faviconUrl: matchingTab?.favIconUrl, className: '' });
    tile.append(favicon);

    if (matchingTab) {
      const dot = document.createElement('span');
      dot.className = 'favorite-live-dot';
      tile.append(dot);

      const reset = document.createElement('span');
      reset.className = `favorite-reset live-dot-close${matchingTab.discarded ? ' discarded-tab' : ''}`;
      reset.textContent = '';
      reset.title = 'Close';
      reset.setAttribute('role', 'button');
      reset.tabIndex = 0;
      reset.addEventListener('keydown', event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); event.stopPropagation(); reset.click(); } });
      reset.setAttribute('aria-label', `Close ${item.title || 'favorite'}`);
      reset.addEventListener('click', async event => {
        event.preventDefault();
        event.stopPropagation();
        await resetSavedTab(item);
      });
      tile.append(reset);
    }

    tile.addEventListener('click', () => focusOrOpen(item));
    els.favorites.append(tile);
  }
}

function renderSpaces() {
  els.spaces.replaceChildren();
  for (const space of model?.spaces || []) {
    const button = document.createElement('button');
    const label = space.title || 'Untitled Space';
    button.className = `space-button${space.id === state.currentSpaceId ? ' active' : ''}`;
    button.type = 'button';
    button.textContent = space.emoji || label.slice(0, 1).toUpperCase();
    button.dataset.label = label;
    button.dataset.spaceId = space.id;
    button.setAttribute('aria-label', label);
    button.addEventListener('click', async () => {
      if (state.currentSpaceId === space.id) return;
      state.currentSpaceId = space.id;
      await saveState({ currentSpaceId: space.id });
      render();
    });
    els.spaces.append(button);
  }

  const openButton = document.createElement('button');
  const openLabel = `Open tabs (${openTabs.length})`;
  openButton.className = `space-button${state.currentSpaceId === OPEN_TABS_SPACE_ID ? ' active' : ''}`;
  openButton.type = 'button';
  openButton.textContent = '🪟';
  openButton.dataset.label = openLabel;
  openButton.dataset.spaceId = OPEN_TABS_SPACE_ID;
  openButton.setAttribute('aria-label', openLabel);

  const count = document.createElement('span');
  count.className = 'space-count';
  count.textContent = String(openTabs.length);
  openButton.append(count);
  openButton.addEventListener('click', async () => {
    if (state.currentSpaceId === OPEN_TABS_SPACE_ID) return;
    state.currentSpaceId = OPEN_TABS_SPACE_ID;
    await saveState({ currentSpaceId: OPEN_TABS_SPACE_ID });
    render();
  });
  openButton.addEventListener('contextmenu', event => {
    event.preventDefault();
    openCloseAllTabsDialog().catch(console.warn);
  });
  els.spaces.append(openButton);
}

let closeAllDialog;
async function openCloseAllTabsDialog() {
  const tabs = (await chrome.tabs.query({ currentWindow: true })).filter(tab => !tab.pinned);
  if (!closeAllDialog) {
    closeAllDialog = document.createElement('dialog');
    closeAllDialog.className = 'item-dialog';
    const form = document.createElement('form');
    form.method = 'dialog';
    form.className = 'item-form';
    const heading = document.createElement('h3');
    heading.textContent = 'Close all open tabs?';
    const text = document.createElement('p');
    text.className = 'close-all-description';
    const actions = document.createElement('div');
    actions.className = 'dialog-actions';
    const cancel = document.createElement('button');
    cancel.textContent = 'Cancel';
    const close = document.createElement('button');
    close.type = 'button';
    close.className = 'danger';
    close.dataset.closeAllTabs = '1';
    close.textContent = 'Close all tabs';
    close.addEventListener('click', async () => {
      closeAllDialog.close();
      await sidebarTabAction('close-window-tabs').catch(() => {});
    });
    actions.append(cancel, close);
    form.append(heading, text, actions);
    closeAllDialog.append(form);
    document.body.append(closeAllDialog);
  }
  closeAllDialog.querySelector('.close-all-description').textContent = `Close all ${tabs.length} tabs in this Chrome window, including Favorites and saved links, but excluding Chrome pinned tabs? Your saved Favorites, links and folders will remain in the sidebar.`;
  closeAllDialog.querySelector('[data-close-all-tabs]').disabled = tabs.length === 0;
  if (!closeAllDialog.open) closeAllDialog.showModal();
  closeAllDialog.querySelector('button').focus();
}

function renderPinned() {
  const isOpenSpace = state.currentSpaceId === OPEN_TABS_SPACE_ID;
  els.pinnedSection.classList.toggle('hidden', isOpenSpace);
  if (isOpenSpace) { els.pinnedSection.dataset.spaceId = ''; return; }

  els.pinned.replaceChildren();
  const space = currentSpace();
  els.pinnedSection.dataset.spaceId = isOpenSpace ? '' : space?.id || '';
  if (!space) {
    els.pinned.append(els.emptyTemplate.content.cloneNode(true));
    return;
  }

  const q = els.search.value.trim().toLowerCase();
  let visible = 0;
  for (const node of space.children || []) {
    const rendered = renderNode(node, q);
    if (rendered) {
      els.pinned.append(rendered);
      visible += 1;
    }
  }
  if (!visible && !q && !model.favorites?.length && model.spaces?.length === 1 && space.id === '__my_space__') {
    els.pinned.append(els.emptyTemplate.content.cloneNode(true));
  } else if (!visible) {
    const empty = document.createElement('div');
    empty.className = 'empty-state';
    empty.textContent = q ? 'No pinned items match your search.' : 'This Space has no pinned items.';
    els.pinned.append(empty);
  }
}

function renderOpenTabs() {
  const isOpenSpace = state.currentSpaceId === OPEN_TABS_SPACE_ID;
  const tabs = isOpenSpace ? openTabs : spaceWorkflowTabs(model, currentSpace(), bindings, allTabs, nativeGroupMap, nativeGroups, currentWindowId);
  els.openTabs.replaceChildren();
  els.openSection.classList.toggle('hidden', !isOpenSpace && !tabs.length);
  if (!isOpenSpace && !tabs.length) return;

  const q = els.search.value.trim().toLowerCase();
  const visibleTabs = tabs.filter(tab => {
    if (!tab.url || tab.url.startsWith('chrome-extension://')) return false;
    return !q || `${tab.title || ''} ${tab.url || ''}`.toLowerCase().includes(q);
  });
  els.openCount.textContent = `(${tabs.length})`;
  const visibleIds = new Set(visibleTabs.map(tab => tab.id));
  const nativePinned = isOpenSpace ? visibleTabs.filter(tab => tab.pinned).sort((a, b) => a.index - b.index) : [];
  if (nativePinned.length) {
    const section = document.createElement('section');
    section.className = 'native-pinned-tabs';
    const heading = document.createElement('div');
    heading.className = 'open-tab-group-header';
    heading.textContent = 'Chrome pinned tabs';
    section.append(heading);
    for (const tab of nativePinned) {
      const row = document.createElement('div');
      row.className = 'row native-pinned-tab';
      row.title = 'Pinned tab';
      row.dataset.nativePinnedTabId = String(tab.id);
      const icon = createFavicon({ url: tab.url, faviconUrl: tab.favIconUrl });
      const title = document.createElement('span');
      title.className = 'row-title';
      title.textContent = tab.title || tab.url || 'Pinned tab';
      row.append(icon, title);
      section.append(row);
    }
    els.openTabs.append(section);
  }
  const editableTabs = tabs.filter(tab => !tab.pinned);
  const sections = isOpenSpace ? groupOpenTabs(editableTabs, nativeGroups) : [{ tabs: editableTabs }];
  for (const section of sections) {
    const sectionTabs = section.tabs.filter(tab => visibleIds.has(tab.id));
    if (!sectionTabs.length) continue;
    let container = els.openTabs;
    if (isOpenSpace) {
      container = document.createElement('section');
      container.className = 'open-tab-group';
      container.dataset.chromeGroupId = String(section.id);
      const header = document.createElement('div');
      header.className = 'open-tab-group-header';
      header.dataset.color = section.color;
      const name = document.createElement('span');
      name.className = 'open-tab-group-name';
      name.textContent = section.title;
      const count = document.createElement('span');
      count.className = 'muted';
      count.textContent = `(${section.tabs.length})`;
      header.append(name, count);
      {
        const close = document.createElement('button');
        close.type = 'button';
        close.className = `close-tab-group live-dot-close${section.tabs.every(tab => tab.discarded) ? ' discarded-tab' : ''}`;
        close.textContent = '';
        close.title = `Close all tabs in ${section.title}`;
        close.setAttribute('aria-label', close.title);
        close.addEventListener('click', () => sidebarTabAction(section.id >= 0 ? 'close-window-group' : 'close-ungrouped-tabs', { groupId: section.id }).catch(() => {}));
        header.append(close);
      }
      container.append(header);
      els.openTabs.append(container);
    }
    for (const tab of sectionTabs) {
    const row = createTabRow(tab, { live: true, active: Boolean(tab.active && tab.windowId === currentWindowId) });
    row.draggable = !isOpenSpace;
    if (!isOpenSpace) row.title += '\nDrag into pinned items to save this tab';
    if (!isOpenSpace && tab.windowId !== currentWindowId) {
      const label = document.createElement('span');
      label.className = 'other-window-label';
      label.textContent = 'Other window';
      row.querySelector('.close-tab').before(label);
    }
    container.append(row);
    }
  }
}

function renderStats() {
  if (!model?.stats) {
    els.stats.textContent = 'No Arc data imported';
    return;
  }
  const s = model.stats;
  const fav = model.favorites?.length ? ` · ${model.favorites.length} favorites` : '';
  els.stats.textContent = `${s.spaces} Spaces · ${s.folders} folders · ${s.tabs} pinned${fav}`;
}

function render() {
  if (!isSidebarActive()) return;
  renderStats();
  renderFavorites();
  renderSpaces();
  renderPinned();
  renderOpenTabs();
  window.dispatchEvent(new CustomEvent('arc-sidebar-rendered'));
}

function scheduleRender() {
  if (!isSidebarActive()) return;
  if (renderFrame != null) return;
  renderFrame = requestAnimationFrame(() => {
    renderFrame = null;
    render();
  });
}

els.arcFile.addEventListener('change', async event => {
  const file = event.target.files?.[0];
  if (!file) return;
  try {
    model = parseArcSidebar(JSON.parse(await file.text()));
    state.currentSpaceId = model.spaces[0]?.id || OPEN_TABS_SPACE_ID;
    state.collapsedFolders = {};
    bindings = {};
    await sidebarStorage.transaction({ local: { [STORAGE_KEY]: model, [STATE_KEY]: state }, session: { [BINDINGS_KEY]: bindings } });
    render();
  } catch (error) {
    console.error(error);
    alert(`Arc import failed: ${error.message}`);
  } finally {
    event.target.value = '';
  }
});

els.search.addEventListener('input', scheduleRender);

chrome.tabs.onCreated.addListener(() => scheduleTabRefresh());
chrome.tabs.onRemoved.addListener(() => scheduleTabRefresh(0));
chrome.tabs.onUpdated.addListener((tabId, changeInfo) => {
  if (changeInfo.groupId === undefined && !changeInfo.url && !changeInfo.title && !changeInfo.favIconUrl && changeInfo.status !== 'complete' && changeInfo.discarded === undefined) return;
  scheduleTabRefresh();
});
chrome.tabs.onActivated.addListener(() => scheduleTabRefresh(0));
chrome.tabs.onMoved.addListener(() => scheduleTabRefresh());
chrome.tabs.onAttached.addListener(() => scheduleTabRefresh());
chrome.tabs.onDetached.addListener(() => scheduleTabRefresh());
chrome.tabs.onReplaced.addListener(() => scheduleTabRefresh(0));
chrome.tabGroups.onCreated.addListener(() => scheduleTabRefresh());
chrome.tabGroups.onUpdated.addListener(() => scheduleTabRefresh());
chrome.tabGroups.onRemoved.addListener(() => scheduleTabRefresh(0));

chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'local') {
    if (changes[STORAGE_KEY]) model = changes[STORAGE_KEY].newValue || null;
    if (changes[STATE_KEY]) state = { currentSpaceId: null, collapsedFolders: {}, ...(changes[STATE_KEY].newValue || {}) };
    if (changes[STORAGE_KEY] || changes[STATE_KEY]) {
      normalizeState();
      scheduleRender();
    }
  }

  if (area === 'session' && (changes[BINDINGS_KEY] || changes[GROUP_MAP_KEY])) {
    if (changes[BINDINGS_KEY]) bindings = changes[BINDINGS_KEY].newValue || {};
    if (changes[GROUP_MAP_KEY]) nativeGroupMap = changes[GROUP_MAP_KEY].newValue || {};
    scheduleTabRefresh(0);
  }
});

let resumeGeneration = 0;
async function resumeSidebar() {
  const token = ++resumeGeneration;
  document.body.classList.add('sidebar-loading');
  try {
    await loadData();
    if (token !== resumeGeneration || !isSidebarActive()) return;
    await refreshOpenTabsNow();
  } finally {
    if (token === resumeGeneration && isSidebarActive()) document.body.classList.remove('sidebar-loading');
  }
}
window.addEventListener('arc-sidebar-activity', event => {
  if (event.detail.active) resumeSidebar().catch(console.error);
  else {
    ++resumeGeneration;
    if (refreshTimer) clearTimeout(refreshTimer);
    refreshTimer = null;
    if (renderFrame != null) cancelAnimationFrame(renderFrame);
    renderFrame = null;
  }
});
if (isSidebarActive()) await resumeSidebar();

// Delegate because the empty-state template is recreated on each render.
els.pinned.addEventListener('click', event => {
  if (event.target.closest('.empty-options-link')) chrome.runtime.openOptionsPage().catch(console.error);
});
