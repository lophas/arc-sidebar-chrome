const STORAGE_KEY = 'arcSidebarModel';
const STATE_KEY = 'arcSidebarState';

const arcFile = document.querySelector('#arcFile');
const status = document.querySelector('#status');
const stats = document.querySelector('#stats');
const importedAt = document.querySelector('#importedAt');

function pairArray(arr = []) {
  const out = new Map();
  for (let i = 0; i + 1 < arr.length; i += 2) {
    if (typeof arr[i] === 'string' && arr[i + 1] && typeof arr[i + 1] === 'object') out.set(arr[i], arr[i + 1]);
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
      return { type: 'tab', id, title: raw.title || tab.savedTitle || url, url };
    }

    if (raw?.data?.list) {
      const children = (raw.childrenIds || []).map(childId => parseItem(childId, new Set(seen))).filter(Boolean);
      return { type: 'folder', id, title: raw.title || 'Untitled folder', children };
    }

    return null;
  };

  const spaces = [];
  for (const [spaceId, space] of spacesMap.entries()) {
    const pinnedContainerId = getPinnedContainerId(space);
    const pinnedContainer = pinnedContainerId ? items.get(pinnedContainerId) : null;
    const children = (pinnedContainer?.childrenIds || []).map(id => parseItem(id)).filter(Boolean);
    spaces.push({
      id: spaceId,
      title: space.title || 'Untitled Space',
      emoji: space?.customInfo?.iconType?.emoji_v2 || '',
      children
    });
  }

  let favorites = [];
  const defaultTopAppsContainer = [...items.values()].find(raw => raw?.data?.itemContainer?.containerType?.topApps?._0?.default === true);
  if (defaultTopAppsContainer) {
    favorites = (defaultTopAppsContainer.childrenIds || []).map(id => parseItem(id)).filter(item => item?.type === 'tab');
  }

  const count = { spaces: spaces.length, folders: 0, tabs: 0, favorites: favorites.length };
  const walk = nodes => {
    for (const node of nodes) {
      if (node.type === 'tab') count.tabs += 1;
      if (node.type === 'folder') { count.folders += 1; walk(node.children || []); }
    }
  };
  spaces.forEach(space => walk(space.children));

  return { version: 2, importedAt: new Date().toISOString(), favorites, spaces, stats: count };
}

function render(model) {
  if (!model?.stats) {
    stats.textContent = 'No data imported.';
    importedAt.textContent = '';
    return;
  }
  stats.textContent = `${model.stats.spaces} Spaces · ${model.stats.folders} folders · ${model.stats.tabs} pinned · ${model.favorites?.length || 0} favorites`;
  importedAt.textContent = model.importedAt ? `Last import: ${new Date(model.importedAt).toLocaleString()}` : '';
}

async function load() {
  const stored = await chrome.storage.local.get(STORAGE_KEY);
  render(stored[STORAGE_KEY]);
}

arcFile.addEventListener('change', async event => {
  const file = event.target.files?.[0];
  if (!file) return;
  try {
    const model = parseArcSidebar(JSON.parse(await file.text()));
    await chrome.storage.local.set({ [STORAGE_KEY]: model, [STATE_KEY]: { currentSpaceId: model.spaces[0]?.id || null, collapsedFolders: {} } });
    status.textContent = 'Import complete.';
    render(model);
  } catch (error) {
    console.error(error);
    status.textContent = `Import failed: ${error.message}`;
  } finally {
    event.target.value = '';
  }
});

await load();
