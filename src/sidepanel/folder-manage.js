const STORAGE_KEY = 'arcSidebarModel';
const STATE_KEY = 'arcSidebarState';
const OPEN_TABS_SPACE_ID = '__open_tabs__';

const pinnedEl = document.querySelector('#pinned');
const searchEl = document.querySelector('#search');
const addFolderButton = document.querySelector('#addFolder');

let folderDialog = null;

function uid() {
  return crypto.randomUUID ? crypto.randomUUID() : `local-folder-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

async function getData() {
  return chrome.storage.local.get([STORAGE_KEY, STATE_KEY]);
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
  await chrome.storage.local.set(values);
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

function ensureFolderDialog() {
  if (folderDialog) return folderDialog;

  folderDialog = document.createElement('dialog');
  folderDialog.className = 'item-dialog folder-dialog';
  folderDialog.innerHTML = `
    <form class="item-form" novalidate>
      <h3 id="folderDialogTitle">Folder</h3>
      <label>Name<input id="folderName" type="text" autocomplete="off"></label>
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
  const model = stored[STORAGE_KEY];
  const state = stored[STATE_KEY] || { currentSpaceId: null, collapsedFolders: {} };
  const space = currentSpace(model, state);
  if (!space) return;
  space.children ||= [];

  const location = folderId ? findFolderLocation(space.children, folderId) : null;
  if (folderId && !location) return;

  const folder = location?.node || null;
  const dialog = ensureFolderDialog();
  const nameInput = dialog.querySelector('#folderName');
  const deleteButton = dialog.querySelector('#folderDelete');
  const deleteNote = dialog.querySelector('#folderDeleteNote');

  dialog.querySelector('#folderDialogTitle').textContent = folder ? 'Rename folder' : `Add folder · ${space.title}`;
  nameInput.value = folder?.title || '';
  nameInput.setCustomValidity('');
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
    if (folder) folder.title = title;
    else space.children.push({ type: 'folder', id: uid(), title, children: [] });
    dialog.close();
    await saveData(model);
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
  const stored = await getData();
  const model = stored[STORAGE_KEY];
  const state = stored[STATE_KEY] || { currentSpaceId: null, collapsedFolders: {} };
  const space = currentSpace(model, state);
  if (!space) return;

  const q = searchEl?.value.trim().toLowerCase() || '';
  const folders = visibleFolderNodes(space.children || [], q);
  const headers = [...pinnedEl.querySelectorAll('.folder-header')];
  headers.forEach((header, index) => {
    const folder = folders[index];
    if (!folder || header.dataset.folderEditManaged === '1') return;
    header.dataset.folderEditManaged = '1';
    header.dataset.folderEditId = folder.id;
    header.classList.add('managed-folder');
    header.title = `${header.title || folder.title}\nRight-click to rename or remove`;
    header.addEventListener('contextmenu', event => {
      event.preventDefault();
      event.stopPropagation();
      openFolderEditor(folder.id);
    });
  });
}

addFolderButton?.addEventListener('click', () => openFolderEditor(null));
window.addEventListener('arc-sidebar-rendered', () => queueMicrotask(decorateFolders));
decorateFolders();
