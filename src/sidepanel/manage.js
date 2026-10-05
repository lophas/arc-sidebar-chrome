const STORAGE_KEY = 'arcSidebarModel';
const STATE_KEY = 'arcSidebarState';
const OPEN_TABS_SPACE_ID = '__open_tabs__';

const favoritesEl = document.querySelector('#favorites');
const pinnedEl = document.querySelector('#pinned');
const pinnedSection = document.querySelector('#pinnedSection');
const searchEl = document.querySelector('#search');
const addFavoriteButton = document.querySelector('#addFavorite');
const addPinnedButton = document.querySelector('#addPinned');

let dragIndex = null;
let draggedPinnedId = null;
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

function findFolder(nodes, id) {
  for (const node of nodes || []) {
    if (node.type === 'folder' && node.id === id) return node;
    if (node.type === 'folder') {
      const found = findFolder(node.children || [], id);
      if (found) return found;
    }
  }
  return null;
}

function removeNode(nodes, id) {
  const location = findNodeLocation(nodes, id);
  if (!location) return null;
  const [node] = location.parent.splice(location.index, 1);
  return node;
}

async function movePinnedRelative(itemId, targetId, after = false) {
  if (!itemId || !targetId || itemId === targetId) return;
  const model = await getModel();
  const state = await getState();
  if (state.currentSpaceId === OPEN_TABS_SPACE_ID) return;

  const space = model.spaces?.find(candidate => candidate.id === state.currentSpaceId) || model.spaces?.[0];
  if (!space) return;
  space.children ||= [];

  const source = findNodeLocation(space.children, itemId);
  const target = findNodeLocation(space.children, targetId);
  if (!source || source.node.type !== 'tab' || !target || target.node.type !== 'tab') return;

  const moved = removeNode(space.children, itemId);
  if (!moved) return;
  const targetAfterRemoval = findNodeLocation(space.children, targetId);
  if (!targetAfterRemoval) return;
  const insertAt = targetAfterRemoval.index + (after ? 1 : 0);
  targetAfterRemoval.parent.splice(insertAt, 0, moved);
  await saveModel(model);
}

async function movePinnedToRoot(itemId) {
  if (!itemId) return;
  const model = await getModel();
  const state = await getState();
  if (state.currentSpaceId === OPEN_TABS_SPACE_ID) return;

  const space = model.spaces?.find(candidate => candidate.id === state.currentSpaceId) || model.spaces?.[0];
  if (!space) return;
  space.children ||= [];
  const location = findNodeLocation(space.children, itemId);
  if (!location || location.node.type !== 'tab' || location.parent === space.children) return;

  const moved = removeNode(space.children, itemId);
  if (!moved) return;
  space.children.push(moved);
  await saveModel(model);
}

async function movePinnedToEmptyFolder(itemId, folderId) {
  if (!itemId || !folderId) return;
  const model = await getModel();
  const state = await getState();
  if (state.currentSpaceId === OPEN_TABS_SPACE_ID) return;

  const space = model.spaces?.find(candidate => candidate.id === state.currentSpaceId) || model.spaces?.[0];
  if (!space) return;
  space.children ||= [];
  const folder = findFolder(space.children, folderId);
  if (!folder) return;
  folder.children ||= [];
  if (folder.children.length) return;

  const moved = removeNode(space.children, itemId);
  if (!moved || moved.type !== 'tab') return;
  folder.children.push(moved);
  await saveModel(model);
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
  return node.type === 'folder' && (node.children || []).some(child => matchesSearch(child, q));
}

function visibleTabNodes(nodes, q, out = []) {
  for (const node of nodes || []) {
    if (!matchesSearch(node, q)) continue;
    if (node.type === 'tab') out.push(node);
    if (node.type === 'folder') visibleTabNodes(node.children || [], q, out);
  }
  return out;
}

function visibleFolderNodes(nodes, q, out = []) {
  for (const node of nodes || []) {
    if (node.type !== 'folder' || !matchesSearch(node, q)) continue;
    out.push(node);
    visibleFolderNodes(node.children || [], q, out);
  }
  return out;
}

function clearDropTargets() {
  pinnedEl?.querySelectorAll('.drop-before,.drop-after,.drop-target-empty').forEach(el => {
    el.classList.remove('drop-before', 'drop-after', 'drop-target-empty');
  });
  pinnedSection?.querySelectorAll('.drop-target-root').forEach(el => el.classList.remove('drop-target-root'));
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
    row.dataset.nodeId = node.id;
    row.classList.add('managed-pinned');
    row.draggable = true;
    row.title = `${row.title || node.url}\nRight-click to edit · Drag between links to move`;

    row.addEventListener('contextmenu', event => {
      event.preventDefault();
      event.stopPropagation();
      openPinnedEditor(node.id);
    });

    row.addEventListener('dragstart', event => {
      draggedPinnedId = node.id;
      row.classList.add('dragging');
      event.dataTransfer.effectAllowed = 'move';
      event.dataTransfer.setData('text/plain', node.id);
    });

    row.addEventListener('dragend', () => {
      row.classList.remove('dragging');
      draggedPinnedId = null;
      clearDropTargets();
    });

    row.addEventListener('dragover', event => {
      const itemId = event.dataTransfer.getData('text/plain') || draggedPinnedId;
      if (!itemId || itemId === node.id) return;
      event.preventDefault();
      event.stopPropagation();
      event.dataTransfer.dropEffect = 'move';
      const rect = row.getBoundingClientRect();
      const after = event.clientY >= rect.top + rect.height / 2;
      clearDropTargets();
      row.classList.add(after ? 'drop-after' : 'drop-before');
    });

    row.addEventListener('dragleave', event => {
      if (!row.contains(event.relatedTarget)) row.classList.remove('drop-before', 'drop-after');
    });

    row.addEventListener('drop', async event => {
      const itemId = event.dataTransfer.getData('text/plain') || draggedPinnedId;
      if (!itemId || itemId === node.id) return;
      event.preventDefault();
      event.stopPropagation();
      const rect = row.getBoundingClientRect();
      const after = event.clientY >= rect.top + rect.height / 2;
      row.classList.remove('drop-before', 'drop-after');
      await movePinnedRelative(itemId, node.id, after);
    });
  });

  const folders = visibleFolderNodes(space.children || [], q);
  const folderHeaders = [...pinnedEl.querySelectorAll('.folder-header')];
  folderHeaders.forEach((header, index) => {
    const folder = folders[index];
    if (!folder || (folder.children || []).length || header.dataset.managedEmptyDrop === '1') return;
    header.dataset.managedEmptyDrop = '1';
    header.title = `${header.title || folder.title}\nEmpty folder · drop a link here`;

    header.addEventListener('dragover', event => {
      const itemId = event.dataTransfer.getData('text/plain') || draggedPinnedId;
      if (!itemId) return;
      event.preventDefault();
      event.stopPropagation();
      event.dataTransfer.dropEffect = 'move';
      clearDropTargets();
      header.classList.add('drop-target-empty');
    });

    header.addEventListener('dragleave', event => {
      if (!header.contains(event.relatedTarget)) header.classList.remove('drop-target-empty');
    });

    header.addEventListener('drop', async event => {
      const itemId = event.dataTransfer.getData('text/plain') || draggedPinnedId;
      if (!itemId) return;
      event.preventDefault();
      event.stopPropagation();
      header.classList.remove('drop-target-empty');
      await movePinnedToEmptyFolder(itemId, folder.id);
    });
  });

  const rootTarget = pinnedSection?.querySelector('.section-title');
  if (rootTarget && rootTarget.dataset.managedRootDrop !== '1') {
    rootTarget.dataset.managedRootDrop = '1';
    rootTarget.title = 'Drop here to move a link to the Space root';

    rootTarget.addEventListener('dragover', event => {
      const itemId = event.dataTransfer.getData('text/plain') || draggedPinnedId;
      if (!itemId) return;
      event.preventDefault();
      event.dataTransfer.dropEffect = 'move';
      clearDropTargets();
      rootTarget.classList.add('drop-target-root');
    });

    rootTarget.addEventListener('dragleave', () => rootTarget.classList.remove('drop-target-root'));
    rootTarget.addEventListener('drop', async event => {
      const itemId = event.dataTransfer.getData('text/plain') || draggedPinnedId;
      if (!itemId) return;
      event.preventDefault();
      rootTarget.classList.remove('drop-target-root');
      await movePinnedToRoot(itemId);
    });
  }
}

function decorateManagedElements() {
  decorateFavorites();
  decoratePinned();
}

addFavoriteButton?.addEventListener('click', () => openFavoriteEditor(null));
addPinnedButton?.addEventListener('click', () => openPinnedEditor(null));
window.addEventListener('arc-sidebar-rendered', () => queueMicrotask(decorateManagedElements));
decorateManagedElements();
