const STORAGE_KEY = 'arcSidebarModel';
const STATE_KEY = 'arcSidebarState';
const OPEN_TABS_SPACE_ID = '__open_tabs__';

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
let openTabs = [];

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

  const count = { spaces: spaces.length, folders: 0, tabs: 0, favorites: favorites.length };
  const walk = nodes => {
    for (const node of nodes) {
      if (node.type === 'tab') count.tabs += 1;
      if (node.type === 'folder') {
        count.folders += 1;
        walk(node.children || []);
      }
    }
  };
  spaces.forEach(space => walk(space.children));

  return {
    version: 2,
    importedAt: new Date().toISOString(),
    favorites,
    spaces,
    stats: count
  };
}

function normalizedUrl(url) {
  try {
    const u = new URL(url);
    u.hash = '';
    return u.href.replace(/\/$/, '');
  } catch {
    return url || '';
  }
}

function domainFor(url) {
  try { return new URL(url).hostname.replace(/^www\./, ''); }
  catch { return ''; }
}

function faviconFor(url) {
  if (!url) return '';
  return `chrome-extension://${chrome.runtime.id}/_favicon/?pageUrl=${encodeURIComponent(url)}&size=32`;
}

async function saveModel() {
  await chrome.storage.local.set({ [STORAGE_KEY]: model });
}

async function saveState() {
  await chrome.storage.local.set({ [STATE_KEY]: state });
}

async function loadData() {
  const stored = await chrome.storage.local.get([STORAGE_KEY, STATE_KEY]);
  model = stored[STORAGE_KEY] || null;
  state = { currentSpaceId: null, collapsedFolders: {}, ...(stored[STATE_KEY] || {}) };
  const validSpace = state.currentSpaceId === OPEN_TABS_SPACE_ID || model?.spaces?.some(s => s.id === state.currentSpaceId);
  if (model?.spaces?.length && !validSpace) {
    state.currentSpaceId = model.spaces[0].id;
  }
}

async function refreshOpenTabs() {
  openTabs = await chrome.tabs.query({ currentWindow: true });
  render();
}

async function focusOrOpen(saved) {
  const wanted = normalizedUrl(saved.url);
  let match = openTabs.find(tab => normalizedUrl(tab.url) === wanted);

  if (!match) {
    try {
      const target = new URL(saved.url);
      match = openTabs.find(tab => {
        try {
          const current = new URL(tab.url);
          return current.origin === target.origin && current.pathname === target.pathname;
        } catch { return false; }
      });
    } catch {}
  }

  if (match?.id != null) {
    await chrome.tabs.update(match.id, { active: true });
    if (match.windowId != null) await chrome.windows.update(match.windowId, { focused: true });
  } else {
    await chrome.tabs.create({ url: saved.url, active: true });
  }
}

function currentSpace() {
  if (state.currentSpaceId === OPEN_TABS_SPACE_ID) return null;
  return model?.spaces?.find(s => s.id === state.currentSpaceId) || model?.spaces?.[0] || null;
}

function matchesSearch(node, q) {
  if (!q) return true;
  const haystack = `${node.title || ''} ${node.url || ''}`.toLowerCase();
  if (haystack.includes(q)) return true;
  if (node.type === 'folder') return (node.children || []).some(child => matchesSearch(child, q));
  return false;
}

function createTabRow(item, { live = false, active = false } = {}) {
  const row = document.createElement('div');
  row.className = `row${active ? ' active' : ''}`;
  row.title = item.url || item.title || '';

  const favicon = document.createElement('img');
  favicon.className = 'favicon';
  favicon.src = live && item.favIconUrl ? item.favIconUrl : faviconFor(item.url);
  favicon.alt = '';
  favicon.addEventListener('error', () => {
    const fallback = document.createElement('span');
    fallback.className = 'favicon-fallback';
    fallback.textContent = '●';
    favicon.replaceWith(fallback);
  }, { once: true });

  const title = document.createElement('span');
  title.className = 'row-title';
  title.textContent = item.title || item.url || 'Untitled';

  const domain = document.createElement('span');
  domain.className = 'row-domain';
  domain.textContent = domainFor(item.url);

  row.append(favicon, title, domain);

  if (live) {
    const close = document.createElement('button');
    close.className = 'close-tab';
    close.type = 'button';
    close.textContent = '×';
    close.title = 'Close tab';
    close.addEventListener('click', async event => {
      event.stopPropagation();
      if (item.id != null) await chrome.tabs.remove(item.id);
    });
    row.append(close);
    row.addEventListener('click', async () => {
      if (item.id != null) await chrome.tabs.update(item.id, { active: true });
    });
  } else {
    row.addEventListener('click', () => focusOrOpen(item));
  }

  return row;
}

function renderNode(node, q) {
  if (!matchesSearch(node, q)) return null;
  if (node.type === 'tab') {
    const active = openTabs.some(tab => normalizedUrl(tab.url) === normalizedUrl(node.url) && tab.active);
    return createTabRow(node, { active });
  }

  if (node.type === 'folder') {
    const folder = document.createElement('div');
    folder.className = 'folder';
    if (state.collapsedFolders[node.id] && !q) folder.classList.add('collapsed');

    const header = document.createElement('div');
    header.className = 'folder-header';
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
      await saveState();
      render();
    });

    folder.append(header, children);
    return folder;
  }

  return null;
}

function renderFavorites() {
  els.favorites.replaceChildren();
  const favorites = model?.favorites || [];
  els.favoritesSection.classList.toggle('hidden', favorites.length === 0);

  for (const item of favorites) {
    const tile = document.createElement('button');
    tile.type = 'button';
    tile.className = 'favorite-tile';
    tile.title = item.title || item.url;

    const matchingTab = openTabs.find(tab => normalizedUrl(tab.url) === normalizedUrl(item.url));
    if (matchingTab?.active) tile.classList.add('active');

    const favicon = document.createElement('img');
    favicon.src = matchingTab?.favIconUrl || faviconFor(item.url);
    favicon.alt = '';
    favicon.addEventListener('error', () => {
      const fallback = document.createElement('span');
      fallback.className = 'favicon-fallback';
      fallback.textContent = '●';
      favicon.replaceWith(fallback);
    }, { once: true });
    tile.append(favicon);

    if (matchingTab) {
      const dot = document.createElement('span');
      dot.className = 'favorite-live-dot';
      tile.append(dot);
    }

    tile.addEventListener('click', () => focusOrOpen(item));
    els.favorites.append(tile);
  }
}

function renderSpaces() {
  els.spaces.replaceChildren();
  if (!model?.spaces?.length) return;

  for (const space of model.spaces) {
    const button = document.createElement('button');
    const label = space.title || 'Untitled Space';
    button.className = `space-button${space.id === state.currentSpaceId ? ' active' : ''}`;
    button.type = 'button';
    button.textContent = space.emoji || label.slice(0, 1).toUpperCase();
    button.dataset.label = label;
    button.setAttribute('aria-label', label);
    button.addEventListener('click', async () => {
      state.currentSpaceId = space.id;
      await saveState();
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
  openButton.setAttribute('aria-label', openLabel);

  const count = document.createElement('span');
  count.className = 'space-count';
  count.textContent = String(openTabs.length);
  openButton.append(count);

  openButton.addEventListener('click', async () => {
    state.currentSpaceId = OPEN_TABS_SPACE_ID;
    await saveState();
    render();
  });
  els.spaces.append(openButton);
}

function renderPinned() {
  const isOpenSpace = state.currentSpaceId === OPEN_TABS_SPACE_ID;
  els.pinnedSection.classList.toggle('hidden', isOpenSpace);
  if (isOpenSpace) return;

  els.pinned.replaceChildren();
  const space = currentSpace();
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
  if (!visible) {
    const empty = document.createElement('div');
    empty.className = 'empty-state';
    empty.textContent = q ? 'No pinned items match your search.' : 'This Space has no imported pinned items.';
    els.pinned.append(empty);
  }
}

function renderOpenTabs() {
  const isOpenSpace = state.currentSpaceId === OPEN_TABS_SPACE_ID;
  els.openSection.classList.toggle('hidden', !isOpenSpace);
  if (!isOpenSpace) return;

  els.openTabs.replaceChildren();
  const q = els.search.value.trim().toLowerCase();
  const visibleTabs = openTabs.filter(tab => {
    if (!tab.url || tab.url.startsWith('chrome-extension://')) return false;
    if (!q) return true;
    return `${tab.title || ''} ${tab.url || ''}`.toLowerCase().includes(q);
  });
  els.openCount.textContent = `(${openTabs.length})`;

  for (const tab of visibleTabs) {
    els.openTabs.append(createTabRow(tab, { live: true, active: Boolean(tab.active) }));
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
  renderStats();
  renderFavorites();
  renderSpaces();
  renderPinned();
  renderOpenTabs();
}

els.arcFile.addEventListener('change', async event => {
  const file = event.target.files?.[0];
  if (!file) return;

  try {
    const json = JSON.parse(await file.text());
    model = parseArcSidebar(json);
    state.currentSpaceId = model.spaces[0]?.id || OPEN_TABS_SPACE_ID;
    state.collapsedFolders = {};
    await saveModel();
    await saveState();
    render();
  } catch (error) {
    console.error(error);
    alert(`Arc import failed: ${error.message}`);
  } finally {
    event.target.value = '';
  }
});

els.search.addEventListener('input', render);

chrome.tabs.onCreated.addListener(refreshOpenTabs);
chrome.tabs.onRemoved.addListener(refreshOpenTabs);
chrome.tabs.onUpdated.addListener(refreshOpenTabs);
chrome.tabs.onActivated.addListener(refreshOpenTabs);

await loadData();
await refreshOpenTabs();
