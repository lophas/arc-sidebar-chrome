import { isSidebarActive } from './lifecycle.js';
import { createStorageClient } from '../shared/storage-client.js';
const sidebarStorage = createStorageClient({ isActive: isSidebarActive });
const STORAGE_KEY = 'arcSidebarModel';
const STATE_KEY = 'arcSidebarState';
const OPEN_TABS_SPACE_ID = '__open_tabs__';

const pinnedEl = document.querySelector('#pinned');
const searchEl = document.querySelector('#search');

function matchesSearch(node, q) {
  if (!q) return true;
  const haystack = `${node.title || ''} ${node.url || ''}`.toLowerCase();
  if (haystack.includes(q)) return true;
  return node.type === 'folder' && (node.children || []).some(child => matchesSearch(child, q));
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

function clearRootIndicators() {
  pinnedEl?.querySelectorAll('.folder-reorder-before,.folder-reorder-after').forEach(folder => {
    if (!folder.classList.contains('reordering')) {
      folder.classList.remove('folder-reorder-before', 'folder-reorder-after');
    }
  });
}

async function movePinnedBesideRootFolder(itemId, targetFolderId, after) {
  if (!itemId || !targetFolderId) return;

  const stored = await sidebarStorage.local.get([STORAGE_KEY, STATE_KEY]);
  const model = stored[STORAGE_KEY];
  const state = stored[STATE_KEY] || {};
  if (!model?.spaces?.length || state.currentSpaceId === OPEN_TABS_SPACE_ID) return;

  const space = model.spaces.find(candidate => candidate.id === state.currentSpaceId) || model.spaces[0];
  if (!space?.children?.length) return;

  const source = findNodeLocation(space.children, itemId);
  if (!source || source.node?.type !== 'tab') return;

  const targetIndexBefore = space.children.findIndex(node => node?.type === 'folder' && node.id === targetFolderId);
  if (targetIndexBefore < 0) return;

  const [moved] = source.parent.splice(source.index, 1);
  if (!moved) return;

  const targetIndex = space.children.findIndex(node => node?.type === 'folder' && node.id === targetFolderId);
  if (targetIndex < 0) return;

  space.children.splice(targetIndex + (after ? 1 : 0), 0, moved);
  await sidebarStorage.local.set({ [STORAGE_KEY]: model });
}

async function decorateRootFolderDropTargets() {
  if (!pinnedEl) return;

  const stored = await sidebarStorage.local.get([STORAGE_KEY, STATE_KEY]);
  const model = stored[STORAGE_KEY];
  const state = stored[STATE_KEY] || {};
  if (!model?.spaces?.length || state.currentSpaceId === OPEN_TABS_SPACE_ID) return;

  const space = model.spaces.find(candidate => candidate.id === state.currentSpaceId) || model.spaces[0];
  if (!space) return;

  const q = searchEl?.value.trim().toLowerCase() || '';
  const rootFolders = (space.children || []).filter(node => node?.type === 'folder' && matchesSearch(node, q));
  const folderEls = [...pinnedEl.children].filter(element => element.classList?.contains('folder'));

  folderEls.forEach((folderEl, index) => {
    const folder = rootFolders[index];
    const header = folderEl.querySelector(':scope > .folder-header');
    if (!folder || !header || header.dataset.rootTabDropManaged === '1') return;

    header.dataset.rootTabDropManaged = '1';
    header.dataset.rootTabDropFolderId = folder.id;

    const edgePosition = event => {
      const rect = header.getBoundingClientRect();
      const y = event.clientY - rect.top;
      if (y <= rect.height * 0.35) return 'before';
      if (y >= rect.height * 0.65) return 'after';
      return null;
    };

    header.addEventListener('dragover', event => {
      if (!event.dataTransfer?.types?.includes('text/plain')) return;
      const position = edgePosition(event);
      if (!position) return;

      event.preventDefault();
      event.stopImmediatePropagation();
      event.dataTransfer.dropEffect = 'move';
      clearRootIndicators();
      folderEl.classList.add(position === 'before' ? 'folder-reorder-before' : 'folder-reorder-after');
    }, true);

    header.addEventListener('dragleave', event => {
      if (!folderEl.contains(event.relatedTarget)) clearRootIndicators();
    }, true);

    header.addEventListener('drop', async event => {
      if (!event.dataTransfer?.types?.includes('text/plain')) return;
      const position = edgePosition(event);
      if (!position) return;

      const itemId = event.dataTransfer.getData('text/plain');
      if (!itemId) return;

      event.preventDefault();
      event.stopImmediatePropagation();
      clearRootIndicators();
      await movePinnedBesideRootFolder(itemId, folder.id, position === 'after');
    }, true);
  });
}

window.addEventListener('arc-sidebar-rendered', () => queueMicrotask(decorateRootFolderDropTargets));
decorateRootFolderDropTargets();
