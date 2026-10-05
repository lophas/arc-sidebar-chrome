const STORAGE_KEY = 'arcSidebarModel';
const STATE_KEY = 'arcSidebarState';
const OPEN_TABS_SPACE_ID = '__open_tabs__';
const HOVER_SWITCH_MS = 550;

const spacesEl = document.querySelector('#spaces');
const pinnedEl = document.querySelector('#pinned');
const pinnedSection = document.querySelector('#pinnedSection');
const searchEl = document.querySelector('#search');

let hoverTimer = null;
let hoverSpaceId = null;

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

function findSourceSpace(model, itemId) {
  for (const space of model.spaces || []) {
    const location = findNodeLocation(space.children || [], itemId);
    if (location) return { space, location };
  }
  return null;
}

function matchesSearch(node, q) {
  if (!q) return true;
  const haystack = `${node.title || ''} ${node.url || ''}`.toLowerCase();
  if (haystack.includes(q)) return true;
  if (node.type === 'folder') return (node.children || []).some(child => matchesSearch(child, q));
  return false;
}

function visibleFolders(nodes, q, out = []) {
  for (const node of nodes || []) {
    if (node.type !== 'folder' || !matchesSearch(node, q)) continue;
    out.push(node);
    visibleFolders(node.children || [], q, out);
  }
  return out;
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
        walk(node.children || []);
      }
    }
  };
  for (const space of model.spaces || []) walk(space.children || []);
  model.stats = stats;
}

function clearHoverTimer() {
  if (hoverTimer) clearTimeout(hoverTimer);
  hoverTimer = null;
  hoverSpaceId = null;
}

async function switchToSpace(spaceId) {
  if (!spaceId || spaceId === OPEN_TABS_SPACE_ID) return;
  const stored = await chrome.storage.local.get(STATE_KEY);
  const state = {
    currentSpaceId: spaceId,
    collapsedFolders: {},
    ...(stored[STATE_KEY] || {})
  };
  if (state.currentSpaceId === spaceId) return;
  state.currentSpaceId = spaceId;
  await chrome.storage.local.set({ [STATE_KEY]: state });

  // index.js owns rendering. Clicking the already-decorated Space button lets
  // it update its in-memory state and redraw without moving the dragged item.
  const button = [...spacesEl.querySelectorAll('.space-button')]
    .find(candidate => candidate.dataset.spaceDropId === spaceId);
  button?.click();
}

function scheduleHoverSwitch(spaceId) {
  if (!spaceId || spaceId === OPEN_TABS_SPACE_ID || hoverSpaceId === spaceId) return;
  clearHoverTimer();
  hoverSpaceId = spaceId;
  hoverTimer = setTimeout(async () => {
    const target = hoverSpaceId;
    clearHoverTimer();
    await switchToSpace(target);
  }, HOVER_SWITCH_MS);
}

async function movePinnedToSpaceRoot(itemId, targetSpaceId) {
  if (!itemId || !targetSpaceId || targetSpaceId === OPEN_TABS_SPACE_ID) return;

  const stored = await chrome.storage.local.get([STORAGE_KEY, STATE_KEY]);
  const model = stored[STORAGE_KEY];
  if (!model?.spaces?.length) return;

  const source = findSourceSpace(model, itemId);
  const targetSpace = model.spaces.find(space => space.id === targetSpaceId);
  if (!source || !targetSpace || source.location.node.type !== 'tab') return;
  if (source.space.id === targetSpace.id) return;

  const [moved] = source.location.parent.splice(source.location.index, 1);
  if (!moved) return;
  targetSpace.children ||= [];
  targetSpace.children.push(moved);
  recalcStats(model);

  const state = {
    currentSpaceId: targetSpace.id,
    collapsedFolders: {},
    ...(stored[STATE_KEY] || {})
  };
  state.currentSpaceId = targetSpace.id;

  await chrome.storage.local.set({
    [STORAGE_KEY]: model,
    [STATE_KEY]: state
  });
}

async function crossSpaceDrop(itemId, targetNodeId = null, after = false, targetFolderId = null, toRoot = false) {
  if (!itemId) return false;

  const stored = await chrome.storage.local.get([STORAGE_KEY, STATE_KEY]);
  const model = stored[STORAGE_KEY];
  const state = stored[STATE_KEY] || {};
  if (!model?.spaces?.length || !state.currentSpaceId || state.currentSpaceId === OPEN_TABS_SPACE_ID) return false;

  const source = findSourceSpace(model, itemId);
  const targetSpace = model.spaces.find(space => space.id === state.currentSpaceId);
  if (!source || !targetSpace || source.location.node.type !== 'tab') return false;
  if (source.space.id === targetSpace.id) return false; // manage.js handles same-Space drops.

  let targetParent = null;
  let targetIndex = null;

  if (targetNodeId) {
    const target = findNodeLocation(targetSpace.children || [], targetNodeId);
    if (!target || target.node.type !== 'tab') return false;
    targetParent = target.parent;
    targetIndex = target.index + (after ? 1 : 0);
  } else if (targetFolderId) {
    const folderLocation = findNodeLocation(targetSpace.children || [], targetFolderId);
    const folder = folderLocation?.node;
    if (!folder || folder.type !== 'folder') return false;
    folder.children ||= [];
    targetParent = folder.children;
    targetIndex = folder.children.length;
  } else if (toRoot) {
    targetSpace.children ||= [];
    targetParent = targetSpace.children;
    targetIndex = targetSpace.children.length;
  } else {
    return false;
  }

  const [moved] = source.location.parent.splice(source.location.index, 1);
  if (!moved) return false;
  targetParent.splice(targetIndex, 0, moved);
  recalcStats(model);
  await chrome.storage.local.set({ [STORAGE_KEY]: model });
  return true;
}

async function decorateSpaceDropTargets() {
  if (!spacesEl) return;

  const stored = await chrome.storage.local.get(STORAGE_KEY);
  const model = stored[STORAGE_KEY];
  if (!model?.spaces?.length) return;

  const buttons = [...spacesEl.querySelectorAll('.space-button')];

  model.spaces.forEach((space, index) => {
    const button = buttons[index];
    if (!button) return;
    if (button.dataset.spaceDropManaged === '1') return;

    button.dataset.spaceDropManaged = '1';
    button.dataset.spaceDropId = space.id;

    button.addEventListener('dragenter', event => {
      if (!event.dataTransfer?.types?.includes('text/plain')) return;
      event.preventDefault();
      button.classList.add('space-drop-target');
      scheduleHoverSwitch(space.id);
    });

    button.addEventListener('dragover', event => {
      if (!event.dataTransfer?.types?.includes('text/plain')) return;
      event.preventDefault();
      event.dataTransfer.dropEffect = 'move';
      button.classList.add('space-drop-target');
      scheduleHoverSwitch(space.id);
    });

    button.addEventListener('dragleave', event => {
      if (!button.contains(event.relatedTarget)) {
        button.classList.remove('space-drop-target');
        if (hoverSpaceId === space.id) clearHoverTimer();
      }
    });

    button.addEventListener('drop', async event => {
      event.preventDefault();
      event.stopPropagation();
      clearHoverTimer();
      button.classList.remove('space-drop-target');
      const itemId = event.dataTransfer.getData('text/plain');
      await movePinnedToSpaceRoot(itemId, space.id);
    });
  });
}

async function decorateFolderIds() {
  if (!pinnedEl) return;
  const stored = await chrome.storage.local.get([STORAGE_KEY, STATE_KEY]);
  const model = stored[STORAGE_KEY];
  const state = stored[STATE_KEY] || {};
  const space = model?.spaces?.find(candidate => candidate.id === state.currentSpaceId);
  if (!space) return;

  const q = searchEl?.value.trim().toLowerCase() || '';
  const folders = visibleFolders(space.children || [], q);
  const headers = [...pinnedEl.querySelectorAll('.folder-header')];
  headers.forEach((header, index) => {
    const folder = folders[index];
    if (folder) header.dataset.crossSpaceFolderId = folder.id;
  });
}

// Capture cross-Space drops before manage.js sees them. This is what allows
// hover-switching to another Space and then dropping directly between its links
// or into one of its folders, all within one continuous drag gesture.
document.addEventListener('drop', async event => {
  const itemId = event.dataTransfer?.getData('text/plain');
  if (!itemId) return;

  const stored = await chrome.storage.local.get([STORAGE_KEY, STATE_KEY]);
  const model = stored[STORAGE_KEY];
  const state = stored[STATE_KEY] || {};
  const source = model ? findSourceSpace(model, itemId) : null;
  if (!source || !state.currentSpaceId || source.space.id === state.currentSpaceId) return;

  const row = event.target.closest?.('.row.managed-pinned');
  if (row?.dataset.nodeId) {
    const rect = row.getBoundingClientRect();
    const after = event.clientY >= rect.top + rect.height / 2;
    event.preventDefault();
    event.stopImmediatePropagation();
    await crossSpaceDrop(itemId, row.dataset.nodeId, after);
    return;
  }

  const header = event.target.closest?.('.folder-header');
  if (header?.dataset.crossSpaceFolderId) {
    event.preventDefault();
    event.stopImmediatePropagation();
    await crossSpaceDrop(itemId, null, false, header.dataset.crossSpaceFolderId);
    return;
  }

  const root = event.target.closest?.('#pinnedSection .section-title');
  if (root) {
    event.preventDefault();
    event.stopImmediatePropagation();
    await crossSpaceDrop(itemId, null, false, null, true);
  }
}, true);

const observer = new MutationObserver(() => {
  queueMicrotask(decorateSpaceDropTargets);
  queueMicrotask(decorateFolderIds);
});

if (spacesEl) observer.observe(spacesEl, { childList: true });
if (pinnedEl) observer.observe(pinnedEl, { childList: true, subtree: true });

decorateSpaceDropTargets();
decorateFolderIds();
