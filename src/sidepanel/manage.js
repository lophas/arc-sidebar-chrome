const STORAGE_KEY = 'arcSidebarModel';
const STATE_KEY = 'arcSidebarState';
const OPEN_TABS_SPACE_ID = '__open_tabs__';

const favoritesEl = document.querySelector('#favorites');
const pinnedEl = document.querySelector('#pinned');
const searchEl = document.querySelector('#search');
const addFavoriteButton = document.querySelector('#addFavorite');
const addPinnedButton = document.querySelector('#addPinned');

let dragIndex = null;
let dialog = null;

function uid() {
  return crypto.randomUUID ? crypto.randomUUID() : `local-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

async function getModel() {
  const stored = await chrome.storage.local.get(STORAGE_KEY);
  return stored[STORAGE_KEY] || {
    version: 2,
    favorites: [],
    spaces: [],
    stats: { spaces: 0, folders: 0, tabs: 0, favorites: 0 }
  };
}

async function getState() {
  const stored = await chrome.storage.local.get(STATE_KEY);
  return stored[STATE_KEY] || { currentSpaceId: null, collapsedFolders: {} };
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
      if (node.type === 'tab') stats.tabs += 1;
      if (node.type === 'folder') {
        stats.folders += 1;
        walk(node.children);
      }
    }
  };

  for (const space of model.spaces || []) walk(space.children);
  model.stats = stats;
}

async function saveModel(model) {
  recalcStats(model);
  await chrome.storage.local.set({ [STORAGE_KEY]: model });
  location.reload();
}

function normalizeEnteredUrl(value) {
  const url = value.trim();
  if (!url) return '';
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(url)) return url;
  if (/^(chrome|edge|about):/i.test(url)) return url;
  return `https://${url}`;
}

function ensureDialog() {
  if (dialog) return dialog;

  dialog = document.createElement('dialog');
  dialog.className = 'item-dialog';
  dialog.innerHTML = `
    <form class="item-form" novalidate>
      <h3 id="itemDialogTitle">Link</h3>
      <label>Title<input id="itemTitle" type="text" autocomplete="off"></label>
      <label>URL<input id="itemUrl" type="text" inputmode="url" autocomplete="off"></label>
      <div class="dialog-actions">
        <button id="itemDelete" class="danger" type="button">Delete</button>
        <span class="dialog-spacer"></span>
        <button id="itemCancel" type="button">Cancel</button>
        <button id="itemSave" class="primary" type="button">Save</button>
      </div>
    </form>`;
  document.body.append(dialog);

  dialog.querySelector('#itemCancel').addEventListener('click', () => dialog.close());
  dialog.addEventListener('cancel', event => {
    event.preventDefault();
    dialog.close();
  });

  return dialog;
}

function validateUrlInput(input) {
  const normalized = normalizeEnteredUrl(input.value);
  if (!normalized) {
    input.setCustomValidity('Please enter a URL.');
    input.reportValidity();
    return null;
  }

  try {
    new URL(normalized);
    input.setCustomValidity('');
    return normalized;
  } catch {
    input.setCustomValidity('Please enter a valid URL.');
    input.reportValidity();
    return null;
  }
}

function findNodeLocation(nodes, id) {
  for (let index = 0; index < (nodes || []).length; index += 1) {
    const node = nodes[index];
    if (node.id === id) return { node, parent: nodes, index };
    if (node.type === 'folder') {
      const found = findNodeLocation(node.children || [], id);
      if (found) return found;
    }
  }
  return null;
}

async function openFavoriteEditor(index = null) {
  const model = await getModel();
  model.favorites ||= [];
  const item = index == null ? null : model.favorites[index];
  const d = ensureDialog();

  d.querySelector('#itemDialogTitle').textContent = item ? 'Edit favorite' : 'Add favorite';
  d.querySelector('#itemTitle').value = item?.title || '';
  d.querySelector('#itemUrl').value = item?.url || '';
  d.querySelector('#itemUrl').setCustomValidity('');
  d.querySelector('#itemDelete').style.display = item ? '' : 'none';

  d.querySelector('#itemSave').onclick = async () => {
    const title = d.querySelector('#itemTitle').value.trim();
    const url = validateUrlInput(d.querySelector('#itemUrl'));
    if (!url) return;

    const next = { type: 'tab', id: item?.id || uid(), title: title || url, url };
    if (item) model.favorites[index] = next;
    else model.favorites.push(next);

    d.close();
    await saveModel(model);
  };

  d.querySelector('#itemDelete').onclick = async () => {
    if (!item) return;
    model.favorites.splice(index, 1);
    d.close();
    await saveModel(model);
  };

  d.showModal();
  setTimeout(() => (item ? d.querySelector('#itemTitle') : d.querySelector('#itemUrl')).focus(), 0);
}

async function openPinnedEditor(itemId = null) {
  const model = await getModel();
  const state = await getState();

  if (state.currentSpaceId === OPEN_TABS_SPACE_ID) return;
  const space = model.spaces?.find(candidate => candidate.id === state.currentSpaceId) || model.spaces?.[0];
  if (!space) return;
  space.children ||= [];

  const location = itemId ? findNodeLocation(space.children, itemId) : null;
  const item = location?.node || null;
  if (itemId && (!item || item.type !== 'tab')) return;

  const d = ensureDialog();
  d.querySelector('#itemDialogTitle').textContent = item ? 'Edit pinned link' : `Add pinned link · ${space.title}`;
  d.querySelector('#itemTitle').value = item?.title || '';
  d.querySelector('#itemUrl').value = item?.url || '';
  d.querySelector('#itemUrl').setCustomValidity('');
  d.querySelector('#itemDelete').style.display = item ? '' : 'none';

  d.querySelector('#itemSave').onclick = async () => {
    const title = d.querySelector('#itemTitle').value.trim();
    const url = validateUrlInput(d.querySelector('#itemUrl'));
    if (!url) return;

    const next = { type: 'tab', id: item?.id || uid(), title: title || url, url };
    if (location) location.parent[location.index] = next;
    else space.children.push(next);

    d.close();
    await saveModel(model);
  };

  d.querySelector('#itemDelete').onclick = async () => {
    if (!location) return;
    location.parent.splice(location.index, 1);
    d.close();
    await saveModel(model);
  };

  d.showModal();
  setTimeout(() => (item ? d.querySelector('#itemTitle') : d.querySelector('#itemUrl')).focus(), 0);
}

function favoriteTiles() {
  return [...favoritesEl.querySelectorAll('.favorite-tile')];
}

function decorateFavorites() {
  if (!favoritesEl) return;

  const tiles = favoriteTiles();
  tiles.forEach((tile, index) => {
    if (tile.dataset.managed === '1') return;
    tile.dataset.managed = '1';
    tile.draggable = true;

    tile.addEventListener('contextmenu', event => {
      event.preventDefault();
      openFavoriteEditor(index);
    });

    tile.addEventListener('dragstart', event => {
      dragIndex = favoriteTiles().indexOf(tile);
      tile.classList.add('dragging');
      event.dataTransfer.effectAllowed = 'move';
    });

    tile.addEventListener('dragend', () => {
      tile.classList.remove('dragging');
      dragIndex = null;
    });

    tile.addEventListener('dragover', event => {
      event.preventDefault();
      event.dataTransfer.dropEffect = 'move';
    });

    tile.addEventListener('drop', async event => {
      event.preventDefault();
      const targetIndex = favoriteTiles().indexOf(tile);
      if (dragIndex == null || targetIndex < 0 || dragIndex === targetIndex) return;

      const model = await getModel();
      const [moved] = model.favorites.splice(dragIndex, 1);
      model.favorites.splice(targetIndex, 0, moved);
      await saveModel(model);
    });
  });
}

function matchesSearch(node, q) {
  if (!q) return true;
  const haystack = `${node.title || ''} ${node.url || ''}`.toLowerCase();
  if (haystack.includes(q)) return true;
  if (node.type === 'folder') return (node.children || []).some(child => matchesSearch(child, q));
  return false;
}

function visibleTabNodes(nodes, q, out = []) {
  for (const node of nodes || []) {
    if (!matchesSearch(node, q)) continue;
    if (node.type === 'tab') out.push(node);
    if (node.type === 'folder') visibleTabNodes(node.children || [], q, out);
  }
  return out;
}

async function decoratePinned() {
  if (!pinnedEl) return;

  const model = await getModel();
  const state = await getState();
  if (state.currentSpaceId === OPEN_TABS_SPACE_ID) return;

  const space = model.spaces?.find(candidate => candidate.id === state.currentSpaceId) || model.spaces?.[0];
  if (!space) return;

  const q = searchEl?.value.trim().toLowerCase() || '';
  const nodes = visibleTabNodes(space.children || [], q);
  const rows = [...pinnedEl.querySelectorAll('.row')];

  rows.forEach((row, index) => {
    const node = nodes[index];
    if (!node || row.dataset.managedPinned === '1') return;

    row.dataset.managedPinned = '1';
    row.classList.add('managed-pinned');
    row.title = `${row.title || node.url}\nRight-click to edit`;
    row.addEventListener('contextmenu', event => {
      event.preventDefault();
      event.stopPropagation();
      openPinnedEditor(node.id);
    });
  });
}

addFavoriteButton?.addEventListener('click', () => openFavoriteEditor(null));
addPinnedButton?.addEventListener('click', () => openPinnedEditor(null));

const observer = new MutationObserver(() => {
  queueMicrotask(decorateFavorites);
  queueMicrotask(decoratePinned);
});

if (favoritesEl) observer.observe(favoritesEl, { childList: true, subtree: true });
if (pinnedEl) observer.observe(pinnedEl, { childList: true, subtree: true });

decorateFavorites();
decoratePinned();

searchEl?.addEventListener('input', () => queueMicrotask(decoratePinned));

chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'local' && changes[STORAGE_KEY]) location.reload();
});
