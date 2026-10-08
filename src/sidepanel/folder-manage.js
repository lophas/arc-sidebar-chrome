import { prepareFirstSpace } from '../shared/first-space.js';
import { isSidebarActive } from './lifecycle.js';
import { sidebarTabAction } from './tab-actions.js';
import { createStorageClient } from '../shared/storage-client.js';
const sidebarStorage = createStorageClient({ isActive: isSidebarActive });
const STORAGE_KEY = 'arcSidebarModel';
const STATE_KEY = 'arcSidebarState';
const BINDINGS_KEY = 'arcSidebarBindings';
const OPEN_TABS_SPACE_ID = '__open_tabs__';

const pinnedEl = document.querySelector('#pinned');
const searchEl = document.querySelector('#search');
const addFolderButton = document.querySelector('#addFolder');

let folderDialog = null;

function uid() {
  return crypto.randomUUID ? crypto.randomUUID() : `local-folder-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

async function getData() {
  return sidebarStorage.local.get([STORAGE_KEY, STATE_KEY]);
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

async function saveData(model, state = null) {
  recalcStats(model);
  const values = { [STORAGE_KEY]: model };
  if (state) values[STATE_KEY] = state;
  await sidebarStorage.local.set(values);
}

function currentSpace(model, state) {
  if (!model?.spaces?.length || state?.currentSpaceId === OPEN_TABS_SPACE_ID) return null;
  return model.spaces.find(space => space.id === state?.currentSpaceId) || model.spaces[0];
}

function matchesSearch(node, q) {
  if (!q) return true;
  const haystack = `${node.title || ''} ${node.url || ''}`.toLowerCase();
  if (haystack.includes(q)) return true;
  return node.type === 'folder' && (node.children || []).some(child => matchesSearch(child, q));
}

function visibleFolderNodes(nodes, q, out = []) {
  for (const node of nodes || []) {
    if (node.type !== 'folder' || !matchesSearch(node, q)) continue;
    out.push(node);
    visibleFolderNodes(node.children || [], q, out);
  }
  return out;
}

function findFolderLocation(nodes, id) {
  for (let index = 0; index < (nodes || []).length; index += 1) {
    const node = nodes[index];
    if (node.type === 'folder' && node.id === id) return { node, parent: nodes, index };
    if (node.type === 'folder') {
      const found = findFolderLocation(node.children || [], id);
      if (found) return found;
    }
  }
  return null;
}

function collectTabIds(nodes, out = []) {
  for (const node of nodes || []) {
    if (node.type === 'tab' && node.id) out.push(node.id);
    if (node.type === 'folder') collectTabIds(node.children || [], out);
  }
  return out;
}

async function closeFolderTabs(folder) { await sidebarTabAction('close', { itemIds: collectTabIds(folder.children || []) }); }

function ensureFolderDialog() {
  if (folderDialog) return folderDialog;

  folderDialog = document.createElement('dialog');
  folderDialog.className = 'item-dialog folder-dialog';
  folderDialog.innerHTML = `
    <form class="item-form" novalidate>
      <h3 id="folderDialogTitle">Folder</h3>
      <label>Name<input id="folderName" type="text" autocomplete="off"></label>
      <label>Space<select id="folderSpace"></select></label>
      <div id="folderDeleteNote" class="folder-delete-note" hidden>Removing a folder keeps its links and places them where the folder was.</div>
      <div class="dialog-actions">
        <button id="folderDelete" class="danger" type="button">Remove folder</button>
        <span class="dialog-spacer"></span>
        <button id="folderCancel" type="button">Cancel</button>
        <button id="folderSave" class="primary" type="button">Save</button>
      </div>
    </form>`;
  document.body.append(folderDialog);
  folderDialog.querySelector('#folderCancel').addEventListener('click', () => folderDialog.close());
  folderDialog.addEventListener('cancel', event => {
    event.preventDefault();
    folderDialog.close();
  });
  return folderDialog;
}

async function openFolderEditor(folderId = null) {
  const stored = await getData();
  let model = stored[STORAGE_KEY];
  const state = stored[STATE_KEY] || { currentSpaceId: null, collapsedFolders: {} };
  let created = false;
  if (!folderId && !model?.spaces?.length) ({model, created} = prepareFirstSpace(model, state));
  const space = currentSpace(model, state);
  if (!space) return;
  space.children ||= [];

  const location = folderId ? findFolderLocation(space.children, folderId) : null;
  if (folderId && !location) return;

  const folder = location?.node || null;
  const dialog = ensureFolderDialog();
  const nameInput = dialog.querySelector('#folderName');
  const spaceSelect = dialog.querySelector('#folderSpace');
  const deleteButton = dialog.querySelector('#folderDelete');
  const deleteNote = dialog.querySelector('#folderDeleteNote');

  dialog.querySelector('#folderDialogTitle').textContent = folder ? 'Edit folder' : `Add folder · ${space.title}`;
  nameInput.value = folder?.title || '';
  nameInput.setCustomValidity('');

  spaceSelect.replaceChildren();
  for (const candidate of model.spaces || []) {
    const option = document.createElement('option');
    option.value = candidate.id;
    option.textContent = `${candidate.emoji || candidate.title?.slice(0, 1).toUpperCase() || '•'} ${candidate.title || 'Untitled Space'}`;
    spaceSelect.append(option);
  }
  spaceSelect.value = space.id;

  deleteButton.style.display = folder ? '' : 'none';
  deleteNote.hidden = !folder;

  dialog.querySelector('#folderSave').onclick = async () => {
    const title = nameInput.value.trim();
    if (!title) {
      nameInput.setCustomValidity('Please enter a folder name.');
      nameInput.reportValidity();
      return;
    }
    nameInput.setCustomValidity('');

    const targetSpace = model.spaces?.find(candidate => candidate.id === spaceSelect.value);
    if (!targetSpace) return;
    targetSpace.children ||= [];

    if (folder) {
      folder.title = title;
      if (targetSpace.id !== space.id) {
        location.parent.splice(location.index, 1);
        targetSpace.children.push(folder);
      }
    } else {
      targetSpace.children.push({ type: 'folder', id: uid(), title, children: [] });
    }

    dialog.close();
    await saveData(model, created ? state : null);
  };

  deleteButton.onclick = async () => {
    if (!location) return;
    const children = location.node.children || [];
    location.parent.splice(location.index, 1, ...children);
    state.collapsedFolders ||= {};
    delete state.collapsedFolders[location.node.id];
    dialog.close();
    await saveData(model, state);
  };

  dialog.showModal();
  setTimeout(() => {
    nameInput.focus();
    nameInput.select();
  }, 0);
}

async function decorateFolders() {
  if (!pinnedEl) return;
  const [stored, session, tabs] = await Promise.all([
    getData(),
    sidebarStorage.session.get(BINDINGS_KEY),
    chrome.tabs.query({})
  ]);
  const model = stored[STORAGE_KEY];
  const state = stored[STATE_KEY] || { currentSpaceId: null, collapsedFolders: {} };
  const bindings = Object.fromEntries(Object.entries(session[BINDINGS_KEY] || {}).filter(([, id]) => tabs.some(tab => tab.id === Number(id) && !tab.pinned)));
  const space = currentSpace(model, state);
  if (!space) return;

  const q = searchEl?.value.trim().toLowerCase() || '';
  const folders = visibleFolderNodes(space.children || [], q);
  const headers = [...pinnedEl.querySelectorAll('.folder-header')];

  headers.forEach((header, index) => {
    const folder = folders[index];
    if (!folder) return;

    if (header.dataset.folderEditManaged !== '1') {
      header.dataset.folderEditManaged = '1';
      header.dataset.folderEditId = folder.id;
      header.classList.add('managed-folder');
      header.title = `${header.title || folder.title}\nRight-click to edit, move or remove`;
      header.addEventListener('contextmenu', event => {
        event.preventDefault();
        event.stopPropagation();
        openFolderEditor(folder.id);
      });
    }

    const liveItemIds = collectTabIds(folder.children || []).filter(itemId => bindings[itemId] != null);
    let closeButton = header.querySelector('.folder-reset');

    if (!liveItemIds.length) {
      header.classList.remove('has-live-tabs');
      closeButton?.remove();
      return;
    }

    header.classList.add('has-live-tabs');
    if (!closeButton) {
      closeButton = document.createElement('button');
      closeButton.type = 'button';
      closeButton.className = 'folder-reset live-dot-close';
      closeButton.textContent = '';
      header.append(closeButton);
    }

    const count = liveItemIds.length;
    closeButton.title = `Close ${count} open tab${count === 1 ? '' : 's'} in this folder`;
    closeButton.setAttribute('aria-label', `Close ${count} open tab${count === 1 ? '' : 's'} in ${folder.title || 'folder'}`);
    closeButton.onclick = async event => {
      event.preventDefault();
      event.stopPropagation();
      const latest = await sidebarStorage.session.get(BINDINGS_KEY);
      await closeFolderTabs(folder, latest[BINDINGS_KEY] || {});
    };
  });
}

addFolderButton?.addEventListener('click', () => openFolderEditor(null));
window.addEventListener('arc-sidebar-rendered', () => queueMicrotask(decorateFolders));
decorateFolders();
