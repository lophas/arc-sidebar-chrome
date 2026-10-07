import { isSidebarActive } from './lifecycle.js';
import { createStorageClient } from '../shared/storage-client.js';
const sidebarStorage = createStorageClient({ isActive: isSidebarActive });
const STORAGE_KEY = 'arcSidebarModel';
const BINDINGS_KEY = 'arcSidebarBindings';
const LAST_SPACE_KEY = 'arcSidebarLastPinSpaceId';

const openTabsEl = document.querySelector('#openTabs');
const openSection = document.querySelector('#openSection');
const searchEl = document.querySelector('#search');

let dialog = null;

function uid() {
  return crypto.randomUUID ? crypto.randomUUID() : `local-tab-${Date.now()}-${Math.random().toString(16).slice(2)}`;
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

function ensureDialog() {
  if (dialog) return dialog;
  dialog = document.createElement('dialog');
  dialog.className = 'item-dialog';
  dialog.innerHTML = `
    <form class="item-form" novalidate>
      <h3>Pin open tab</h3>
      <label>Title<input id="openPinTitle" type="text" autocomplete="off"></label>
      <label>URL<input id="openPinUrl" type="text" readonly></label>
      <label>Space<select id="openPinSpace"></select></label>
      <label>Folder<select id="openPinFolder"></select></label>
      <div class="dialog-actions">
        <span class="dialog-spacer"></span>
        <button id="openPinCancel" type="button">Cancel</button>
        <button id="openPinSave" class="primary" type="button">Save</button>
      </div>
    </form>`;
  document.body.append(dialog);
  dialog.querySelector('#openPinCancel').addEventListener('click', () => dialog.close());
  dialog.addEventListener('cancel', event => {
    event.preventDefault();
    dialog.close();
  });
  return dialog;
}

function fillFolderOptions(select, space) {
  select.replaceChildren();
  const root = document.createElement('option');
  root.value = '';
  root.textContent = 'Space root';
  select.append(root);
  for (const node of space?.children || []) {
    if (node.type !== 'folder') continue;
    const option = document.createElement('option');
    option.value = node.id;
    option.textContent = node.title || 'Untitled folder';
    select.append(option);
  }
}

async function openPinDialog(tab) {
  if (!tab?.id || !tab.url) return;

  const [stored, session] = await Promise.all([
    sidebarStorage.local.get([STORAGE_KEY, LAST_SPACE_KEY]),
    sidebarStorage.session.get(BINDINGS_KEY)
  ]);

  const model = stored[STORAGE_KEY];
  if (!model?.spaces?.length) return;

  const bindings = session[BINDINGS_KEY] || {};
  if (Object.values(bindings).map(Number).includes(Number(tab.id))) return;

  const d = ensureDialog();
  const titleInput = d.querySelector('#openPinTitle');
  const urlInput = d.querySelector('#openPinUrl');
  const spaceSelect = d.querySelector('#openPinSpace');
  const folderSelect = d.querySelector('#openPinFolder');

  titleInput.value = tab.title || tab.url;
  urlInput.value = tab.url;
  spaceSelect.replaceChildren();

  for (const space of model.spaces) {
    const option = document.createElement('option');
    option.value = space.id;
    option.textContent = `${space.emoji || space.title?.slice(0, 1).toUpperCase() || '•'} ${space.title || 'Untitled Space'}`;
    spaceSelect.append(option);
  }

  const preferredSpaceId = model.spaces.some(space => space.id === stored[LAST_SPACE_KEY])
    ? stored[LAST_SPACE_KEY]
    : model.spaces[0].id;
  spaceSelect.value = preferredSpaceId;
  fillFolderOptions(folderSelect, model.spaces.find(space => space.id === preferredSpaceId));

  spaceSelect.onchange = () => {
    fillFolderOptions(folderSelect, model.spaces.find(candidate => candidate.id === spaceSelect.value));
  };

  d.querySelector('#openPinSave').onclick = async () => {
    const space = model.spaces.find(candidate => candidate.id === spaceSelect.value);
    if (!space) return;

    const item = {
      type: 'tab',
      id: uid(),
      title: titleInput.value.trim() || tab.title || tab.url,
      url: tab.url
    };

    space.children ||= [];
    if (folderSelect.value) {
      const folder = findFolder(space.children, folderSelect.value);
      if (!folder) return;
      folder.children ||= [];
      folder.children.push(item);
    } else {
      space.children.push(item);
    }

    recalcStats(model);
    bindings[item.id] = tab.id;
    d.close();
    await sidebarStorage.transaction({
      local: { [STORAGE_KEY]: model, [LAST_SPACE_KEY]: space.id },
      session: { [BINDINGS_KEY]: bindings }
    });
  };

  d.showModal();
  setTimeout(() => {
    titleInput.focus();
    titleInput.select();
  }, 0);
}

async function currentVisibleTabs() {
  const tabs = await chrome.tabs.query({ currentWindow: true });
  const q = searchEl?.value.trim().toLowerCase() || '';
  return tabs.filter(tab => {
    if (!tab.url || tab.url.startsWith('chrome-extension://')) return false;
    if (!q) return true;
    return `${tab.title || ''} ${tab.url || ''}`.toLowerCase().includes(q);
  });
}

async function decorateOpenTabs() {
  if (!isSidebarActive()) return;
  if (!openTabsEl || openSection?.classList.contains('hidden')) return;

  const [tabs, session] = await Promise.all([
    currentVisibleTabs(),
    sidebarStorage.session.get(BINDINGS_KEY)
  ]);
  const boundTabIds = new Set(Object.values(session[BINDINGS_KEY] || {}).map(Number));
  const rows = [...openTabsEl.querySelectorAll('.row')];

  rows.forEach((row, index) => {
    const tab = tabs[index];
    if (!tab || row.dataset.openPinManaged === '1') return;
    row.dataset.openPinManaged = '1';
    const alreadyPinned = tab.id != null && boundTabIds.has(Number(tab.id));
    row.classList.toggle('open-tab-already-pinned', alreadyPinned);
    row.title = `${row.title || tab.url}${alreadyPinned ? '\nAlready pinned/favorite' : '\nRight-click to pin this tab'}`;
    if (!alreadyPinned) {
      row.addEventListener('contextmenu', event => {
        event.preventDefault();
        event.stopPropagation();
        openPinDialog(tab);
      });
    }
  });
}

window.addEventListener('arc-sidebar-rendered', () => queueMicrotask(decorateOpenTabs));
decorateOpenTabs();
