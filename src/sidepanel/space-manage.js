import { isSidebarActive } from './lifecycle.js';
import { createStorageClient } from '../shared/storage-client.js';
const sidebarStorage = createStorageClient({ isActive: isSidebarActive });
const STORAGE_KEY = 'arcSidebarModel';
const STATE_KEY = 'arcSidebarState';
const OPEN_TABS_SPACE_ID = '__open_tabs__';

const spacesEl = document.querySelector('#spaces');
const EMOJIS = ['🏠','💼','🛒','🎬','🎵','📚','🧰','🖥️','🌐','✉️','💬','📷','🧭','✈️','🚗','💡','⭐','❤️','🧪','🔧','📁','📰','📺','💰'];

let spaceDialog = null;
let deleteDialog = null;

function uid() {
  return crypto.randomUUID ? crypto.randomUUID() : `local-space-${Date.now()}-${Math.random().toString(16).slice(2)}`;
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

async function saveData(model, state) {
  recalcStats(model);
  await sidebarStorage.local.set({
    [STORAGE_KEY]: model,
    [STATE_KEY]: state
  });
}

function ensureSpaceDialog() {
  if (spaceDialog) return spaceDialog;

  spaceDialog = document.createElement('dialog');
  spaceDialog.className = 'item-dialog space-dialog';
  spaceDialog.innerHTML = `
    <form class="item-form" novalidate>
      <h3 id="spaceDialogTitle">Space</h3>
      <label>Name<input id="spaceName" type="text" autocomplete="off"></label>
      <div class="space-icon-editor">
        <div class="space-icon-label">Icon</div>
        <div class="space-icon-row">
          <div id="spaceIconPreview" class="space-icon-preview">A</div>
          <input id="spaceEmoji" class="space-emoji-input" type="text" autocomplete="off" placeholder="Paste any emoji, or leave blank">
        </div>
        <div id="spaceEmojiGrid" class="space-emoji-grid" aria-label="Choose Space icon"></div>
      </div>
      <div class="dialog-actions">
        <button id="spaceDelete" class="danger" type="button">Remove Space</button>
        <span class="dialog-spacer"></span>
        <button id="spaceCancel" type="button">Cancel</button>
        <button id="spaceSave" class="primary" type="button">Save</button>
      </div>
    </form>`;
  document.body.append(spaceDialog);

  const grid = spaceDialog.querySelector('#spaceEmojiGrid');
  const emojiInput = spaceDialog.querySelector('#spaceEmoji');
  const preview = spaceDialog.querySelector('#spaceIconPreview');
  const nameInput = spaceDialog.querySelector('#spaceName');

  for (const emoji of EMOJIS) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'space-emoji-choice';
    button.textContent = emoji;
    button.title = emoji;
    button.addEventListener('click', () => {
      emojiInput.value = emoji;
      preview.textContent = emoji;
      grid.querySelectorAll('.selected').forEach(el => el.classList.remove('selected'));
      button.classList.add('selected');
    });
    grid.append(button);
  }

  const updatePreview = () => {
    const emoji = emojiInput.value.trim();
    const name = nameInput.value.trim();
    preview.textContent = emoji || name.slice(0, 1).toUpperCase() || '•';
    grid.querySelectorAll('.space-emoji-choice').forEach(button => {
      button.classList.toggle('selected', button.textContent === emoji);
    });
  };

  emojiInput.addEventListener('input', updatePreview);
  nameInput.addEventListener('input', updatePreview);
  spaceDialog.querySelector('#spaceCancel').addEventListener('click', () => spaceDialog.close());
  spaceDialog.addEventListener('cancel', event => {
    event.preventDefault();
    spaceDialog.close();
  });

  return spaceDialog;
}

function collectFolderIds(nodes, out = []) {
  for (const node of nodes || []) {
    if (node.type === 'folder') {
      out.push(node.id);
      collectFolderIds(node.children || [], out);
    }
  }
  return out;
}

function ensureDeleteDialog() {
  if (deleteDialog) return deleteDialog;

  deleteDialog = document.createElement('dialog');
  deleteDialog.className = 'item-dialog space-delete-dialog';
  deleteDialog.innerHTML = `
    <form class="item-form" novalidate>
      <h3>Remove Space</h3>
      <div id="spaceDeleteSummary" class="space-delete-summary"></div>
      <label id="spaceMoveLabel">Move pinned items to
        <select id="spaceMoveTarget"></select>
      </label>
      <label class="space-danger-option">
        <input id="spaceDeleteItems" type="checkbox">
        <span>Delete this Space and all of its pinned items instead</span>
      </label>
      <label id="spaceDeleteConfirmWrap" class="space-danger-confirm" hidden>
        <input id="spaceDeleteConfirm" type="checkbox">
        <span>I understand that these pinned items will be permanently removed.</span>
      </label>
      <div class="dialog-actions">
        <span class="dialog-spacer"></span>
        <button id="spaceDeleteCancel" type="button">Cancel</button>
        <button id="spaceDeleteCommit" class="danger primary" type="button">Remove Space</button>
      </div>
    </form>`;
  document.body.append(deleteDialog);

  deleteDialog.querySelector('#spaceDeleteCancel').addEventListener('click', () => deleteDialog.close());
  deleteDialog.addEventListener('cancel', event => {
    event.preventDefault();
    deleteDialog.close();
  });

  const destructive = deleteDialog.querySelector('#spaceDeleteItems');
  const confirmWrap = deleteDialog.querySelector('#spaceDeleteConfirmWrap');
  const confirm = deleteDialog.querySelector('#spaceDeleteConfirm');
  const moveLabel = deleteDialog.querySelector('#spaceMoveLabel');
  const commit = deleteDialog.querySelector('#spaceDeleteCommit');

  const syncMode = () => {
    confirmWrap.hidden = !destructive.checked;
    moveLabel.classList.toggle('disabled', destructive.checked);
    moveLabel.querySelector('select').disabled = destructive.checked;
    if (!destructive.checked) confirm.checked = false;
    commit.disabled = destructive.checked && !confirm.checked;
  };

  destructive.addEventListener('change', syncMode);
  confirm.addEventListener('change', syncMode);
  return deleteDialog;
}

async function openDeleteSpace(spaceId) {
  const stored = await getData();
  const model = stored[STORAGE_KEY];
  const state = stored[STATE_KEY] || { currentSpaceId: null, collapsedFolders: {} };
  if (!model?.spaces?.length || model.spaces.length <= 1) return;

  const index = model.spaces.findIndex(space => space.id === spaceId);
  if (index < 0) return;
  const space = model.spaces[index];
  const others = model.spaces.filter(candidate => candidate.id !== space.id);
  const dialog = ensureDeleteDialog();
  const select = dialog.querySelector('#spaceMoveTarget');
  const destructive = dialog.querySelector('#spaceDeleteItems');
  const confirm = dialog.querySelector('#spaceDeleteConfirm');
  const confirmWrap = dialog.querySelector('#spaceDeleteConfirmWrap');
  const moveLabel = dialog.querySelector('#spaceMoveLabel');
  const commit = dialog.querySelector('#spaceDeleteCommit');

  dialog.querySelector('#spaceDeleteSummary').textContent = `Remove “${space.title}”. By default its pinned links and folders will be moved intact to another Space.`;
  select.replaceChildren();
  for (const candidate of others) {
    const option = document.createElement('option');
    option.value = candidate.id;
    option.textContent = `${candidate.emoji || candidate.title.slice(0, 1).toUpperCase()} ${candidate.title}`;
    select.append(option);
  }

  destructive.checked = false;
  confirm.checked = false;
  confirmWrap.hidden = true;
  moveLabel.classList.remove('disabled');
  select.disabled = false;
  commit.disabled = false;

  commit.onclick = async () => {
    if (destructive.checked && !confirm.checked) return;

    if (!destructive.checked) {
      const target = model.spaces.find(candidate => candidate.id === select.value);
      if (!target) return;
      target.children ||= [];
      target.children.push(...(space.children || []));
    }

    const removedFolderIds = collectFolderIds(space.children || []);
    model.spaces.splice(index, 1);
    state.collapsedFolders ||= {};
    for (const folderId of removedFolderIds) delete state.collapsedFolders[folderId];

    if (state.currentSpaceId === space.id) {
      state.currentSpaceId = !destructive.checked && select.value
        ? select.value
        : model.spaces[0]?.id || null;
    }

    dialog.close();
    spaceDialog?.close();
    await saveData(model, state);
  };

  dialog.showModal();
}

async function openSpaceEditor(spaceId = null) {
  const stored = await getData();
  const model = stored[STORAGE_KEY];
  const state = stored[STATE_KEY] || { currentSpaceId: null, collapsedFolders: {} };
  if (!model?.spaces) return;

  const space = spaceId ? model.spaces.find(candidate => candidate.id === spaceId) : null;
  if (spaceId && !space) return;

  const dialog = ensureSpaceDialog();
  const nameInput = dialog.querySelector('#spaceName');
  const emojiInput = dialog.querySelector('#spaceEmoji');
  const preview = dialog.querySelector('#spaceIconPreview');
  const deleteButton = dialog.querySelector('#spaceDelete');
  const grid = dialog.querySelector('#spaceEmojiGrid');

  dialog.querySelector('#spaceDialogTitle').textContent = space ? 'Edit Space' : 'Add Space';
  nameInput.value = space?.title || '';
  emojiInput.value = space?.emoji || '';
  nameInput.setCustomValidity('');
  preview.textContent = space?.emoji || space?.title?.slice(0, 1).toUpperCase() || '•';
  grid.querySelectorAll('.space-emoji-choice').forEach(button => {
    button.classList.toggle('selected', button.textContent === emojiInput.value.trim());
  });

  deleteButton.style.display = space ? '' : 'none';
  deleteButton.disabled = Boolean(space && model.spaces.length <= 1);
  deleteButton.title = space && model.spaces.length <= 1 ? 'The last Space cannot be removed' : '';

  dialog.querySelector('#spaceSave').onclick = async () => {
    const title = nameInput.value.trim();
    if (!title) {
      nameInput.setCustomValidity('Please enter a Space name.');
      nameInput.reportValidity();
      return;
    }
    nameInput.setCustomValidity('');
    const emoji = emojiInput.value.trim();

    if (space) {
      space.title = title;
      space.emoji = emoji;
    } else {
      const newSpace = { id: uid(), title, emoji, children: [] };
      model.spaces.push(newSpace);
      state.currentSpaceId = newSpace.id;
    }

    dialog.close();
    await saveData(model, state);
  };

  deleteButton.onclick = () => {
    if (!space || model.spaces.length <= 1) return;
    openDeleteSpace(space.id);
  };

  dialog.showModal();
  setTimeout(() => {
    nameInput.focus();
    nameInput.select();
  }, 0);
}

function decorateSpaces() {
  if (!spacesEl) return;

  const buttons = [...spacesEl.querySelectorAll('.space-button')];
  const normalButtons = buttons.filter(button => !button.classList.contains('space-add-button') && !button.querySelector('.space-count'));

  normalButtons.forEach(button => {
    if (button.dataset.spaceEditManaged === '1') return;
    button.dataset.spaceEditManaged = '1';
    button.addEventListener('contextmenu', async event => {
      event.preventDefault();
      event.stopPropagation();
      const stored = await getData();
      const model = stored[STORAGE_KEY];
      const spaceId = button.dataset.spaceId;
      const space = model?.spaces?.find(candidate => candidate.id === spaceId);
      if (space) openSpaceEditor(space.id);
    });
  });

  let add = spacesEl.querySelector('.space-add-button');
  if (!add) {
    add = document.createElement('button');
    add.type = 'button';
    add.className = 'space-button space-add-button';
    add.textContent = '+';
    add.dataset.label = 'Add Space';
    add.setAttribute('aria-label', 'Add Space');
    add.title = 'Add Space';
    add.addEventListener('click', () => openSpaceEditor(null));
    spacesEl.append(add);
  }
}

window.addEventListener('arc-sidebar-rendered', () => queueMicrotask(decorateSpaces));
decorateSpaces();
