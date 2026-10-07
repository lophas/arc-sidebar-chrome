import { isSidebarActive } from './lifecycle.js';
import { createStorageClient } from '../shared/storage-client.js';
const sidebarStorage = createStorageClient({ isActive: isSidebarActive });
const STORAGE_KEY = 'arcSidebarModel';
const STATE_KEY = 'arcSidebarState';
const OPEN_TABS_SPACE_ID = '__open_tabs__';
const SPACE_DRAG_TYPE = 'application/x-arc-sidebar-space';
const FOLDER_DRAG_TYPE = 'application/x-arc-sidebar-folder';

const spacesEl = document.querySelector('#spaces');
const pinnedEl = document.querySelector('#pinned');
const searchEl = document.querySelector('#search');

let draggedSpaceId = null;
let draggedFolderId = null;

async function getData() {
  return sidebarStorage.local.get([STORAGE_KEY, STATE_KEY]);
}

function matchesSearch(node, q) {
  if (!q) return true;
  const haystack = `${node?.title || ''} ${node?.url || ''}`.toLowerCase();
  if (haystack.includes(q)) return true;
  return node?.type === 'folder' && (node.children || []).some(child => matchesSearch(child, q));
}

function clearSpaceDropIndicators() {
  spacesEl?.querySelectorAll('.space-reorder-before,.space-reorder-after').forEach(button => {
    button.classList.remove('space-reorder-before', 'space-reorder-after');
  });
}

function clearFolderDropIndicators() {
  pinnedEl?.querySelectorAll('.folder-reorder-before,.folder-reorder-after').forEach(folder => {
    folder.classList.remove('folder-reorder-before', 'folder-reorder-after');
  });
}

async function reorderSpace(sourceId, targetId, after) {
  if (!sourceId || !targetId || sourceId === targetId) return;
  const stored = await sidebarStorage.local.get(STORAGE_KEY);
  const model = stored[STORAGE_KEY];
  if (!model?.spaces?.length) return;

  const sourceIndex = model.spaces.findIndex(space => space.id === sourceId);
  const targetIndex = model.spaces.findIndex(space => space.id === targetId);
  if (sourceIndex < 0 || targetIndex < 0) return;

  const [moved] = model.spaces.splice(sourceIndex, 1);
  let insertAt = model.spaces.findIndex(space => space.id === targetId);
  if (insertAt < 0) return;
  if (after) insertAt += 1;
  model.spaces.splice(insertAt, 0, moved);
  await sidebarStorage.local.set({ [STORAGE_KEY]: model });
}

async function reorderFolder(sourceId, targetId, after) {
  if (!sourceId || !targetId || sourceId === targetId) return;
  const stored = await getData();
  const model = stored[STORAGE_KEY];
  const state = stored[STATE_KEY] || {};
  if (!model?.spaces?.length || !state.currentSpaceId || state.currentSpaceId === OPEN_TABS_SPACE_ID) return;

  const space = model.spaces.find(candidate => candidate.id === state.currentSpaceId);
  if (!space?.children?.length) return;

  // Reorder root folders among both links and folders in the current Space.
  const sourceIndex = space.children.findIndex(node => node?.type === 'folder' && node.id === sourceId);
  const targetIndex = space.children.findIndex(node => node.id === targetId);
  if (sourceIndex < 0 || targetIndex < 0) return;

  const [moved] = space.children.splice(sourceIndex, 1);
  let insertAt = space.children.findIndex(node => node.id === targetId);
  if (insertAt < 0) return;
  if (after) insertAt += 1;
  space.children.splice(insertAt, 0, moved);
  await sidebarStorage.local.set({ [STORAGE_KEY]: model });
}

function decorateSpaceReordering() {
  if (!spacesEl) return;

  const buttons = [...spacesEl.querySelectorAll('.space-button[data-space-id]')]
    .filter(button => button.dataset.spaceId !== OPEN_TABS_SPACE_ID);

  for (const button of buttons) {
    if (button.dataset.spaceReorderManaged === '1') continue;
    button.dataset.spaceReorderManaged = '1';
    button.draggable = true;

    button.addEventListener('dragstart', event => {
      const spaceId = button.dataset.spaceId;
      if (!spaceId) return;
      draggedSpaceId = spaceId;
      button.classList.add('reordering');
      event.dataTransfer.effectAllowed = 'move';
      event.dataTransfer.setData(SPACE_DRAG_TYPE, spaceId);
    });

    button.addEventListener('dragend', () => {
      draggedSpaceId = null;
      button.classList.remove('reordering');
      clearSpaceDropIndicators();
    });

    button.addEventListener('dragover', event => {
      const sourceId = event.dataTransfer?.getData(SPACE_DRAG_TYPE) || draggedSpaceId;
      const targetId = button.dataset.spaceId;
      if (!sourceId || !targetId || sourceId === targetId) return;
      event.preventDefault();
      event.stopPropagation();
      event.dataTransfer.dropEffect = 'move';
      clearSpaceDropIndicators();
      const rect = button.getBoundingClientRect();
      button.classList.add(event.clientX >= rect.left + rect.width / 2 ? 'space-reorder-after' : 'space-reorder-before');
    });

    button.addEventListener('dragleave', event => {
      if (!button.contains(event.relatedTarget)) {
        button.classList.remove('space-reorder-before', 'space-reorder-after');
      }
    });

    button.addEventListener('drop', async event => {
      const sourceId = event.dataTransfer?.getData(SPACE_DRAG_TYPE) || draggedSpaceId;
      const targetId = button.dataset.spaceId;
      if (!sourceId || !targetId || sourceId === targetId) return;
      event.preventDefault();
      event.stopPropagation();
      const rect = button.getBoundingClientRect();
      const after = event.clientX >= rect.left + rect.width / 2;
      clearSpaceDropIndicators();
      await reorderSpace(sourceId, targetId, after);
    });
  }
}

async function decorateFolderReordering() {
  if (!pinnedEl) return;

  const stored = await getData();
  const model = stored[STORAGE_KEY];
  const state = stored[STATE_KEY] || {};
  if (!model?.spaces?.length || !state.currentSpaceId || state.currentSpaceId === OPEN_TABS_SPACE_ID) return;

  const space = model.spaces.find(candidate => candidate.id === state.currentSpaceId);
  if (!space) return;

  // Do not depend on folder-manage.js / space-dnd.js having already decorated
  // the headers. Those decorators are async and can run after this module.
  // Instead, derive the folder IDs directly from the current model and map them
  // to the root-level folder elements in exactly the same render/search order.
  const q = searchEl?.value.trim().toLowerCase() || '';
  const visibleRootFolders = (space.children || [])
    .filter(node => node?.type === 'folder' && matchesSearch(node, q));
  const folderEls = [...pinnedEl.children]
    .filter(element => element.classList?.contains('folder'));

  // Root link rows are valid insertion targets too. Nested rows remain link
  // drop targets; a folder is not implicitly nested by this reorder gesture.
  for (const row of pinnedEl.querySelectorAll(':scope > .row[data-saved-node-id]')) {
    decorateFolderDropTarget(row, row, row.dataset.savedNodeId);
  }

  folderEls.forEach((folderEl, index) => {
    const folder = visibleRootFolders[index];
    const header = folderEl.querySelector(':scope > .folder-header');
    if (!folder || !header) return;

    const folderId = folder.id;
    header.dataset.folderReorderId = folderId;
    if (header.dataset.folderReorderManaged === '1') return;

    header.dataset.folderReorderManaged = '1';
    header.draggable = true;

    header.addEventListener('dragstart', event => {
      const sourceId = header.dataset.folderReorderId;
      if (!sourceId) {
        event.preventDefault();
        return;
      }
      draggedFolderId = sourceId;
      folderEl.classList.add('reordering');
      event.dataTransfer.effectAllowed = 'move';
      event.dataTransfer.setData(FOLDER_DRAG_TYPE, sourceId);
    });

    header.addEventListener('dragend', () => {
      draggedFolderId = null;
      folderEl.classList.remove('reordering');
      clearFolderDropIndicators();
    });

    decorateFolderDropTarget(header, folderEl, folderId);
  });
}

function decorateFolderDropTarget(element, indicator, targetId) {
  element.dataset.folderReorderTargetId = targetId;
  if (element.dataset.folderDropManaged === '1') return;
  element.dataset.folderDropManaged = '1';
  element.addEventListener('dragover', event => {
    const sourceId = event.dataTransfer?.getData(FOLDER_DRAG_TYPE) || draggedFolderId;
    const targetId = element.dataset.folderReorderTargetId;
    if (!sourceId || !targetId || sourceId === targetId) return;
    event.preventDefault();
    event.stopPropagation();
    event.dataTransfer.dropEffect = 'move';
    clearFolderDropIndicators();
    const rect = element.getBoundingClientRect();
    indicator.classList.add(event.clientY >= rect.top + rect.height / 2 ? 'folder-reorder-after' : 'folder-reorder-before');
  });

  element.addEventListener('dragleave', event => {
    if (!indicator.contains(event.relatedTarget)) {
      indicator.classList.remove('folder-reorder-before', 'folder-reorder-after');
    }
  });

  element.addEventListener('drop', async event => {
    const sourceId = event.dataTransfer?.getData(FOLDER_DRAG_TYPE) || draggedFolderId;
    const targetId = element.dataset.folderReorderTargetId;
    if (!sourceId || !targetId || sourceId === targetId) return;
    event.preventDefault();
    event.stopPropagation();
    const rect = element.getBoundingClientRect();
    const after = event.clientY >= rect.top + rect.height / 2;
    clearFolderDropIndicators();
    await reorderFolder(sourceId, targetId, after);
  });
}

function decorateHierarchyDnD() {
  decorateSpaceReordering();
  decorateFolderReordering().catch(error => {
    console.warn('Arc Sidebar: folder reorder decoration failed', error);
  });
}

window.addEventListener('arc-sidebar-rendered', () => queueMicrotask(decorateHierarchyDnD));
decorateHierarchyDnD();
