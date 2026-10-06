const STORAGE_KEY = 'arcSidebarModel';
const STATE_KEY = 'arcSidebarState';
const OPEN_TABS_SPACE_ID = '__open_tabs__';

const favoritesEl = document.querySelector('#favorites');
const pinnedEl = document.querySelector('#pinned');
const searchEl = document.querySelector('#search');
const addFavoriteButton = document.querySelector('#addFavorite');
const addPinnedButton = document.querySelector('#addPinned');

const ICON_PRESETS = ['⭐','❤️','💬','📧','📅','📚','🧰','🖥️','🏠','🌐','📰','🎬','🎵','📷','🧭','✈️','🚗','💡','🔧','🧪'];

let cachedModel = null;
let cachedState = { currentSpaceId: null, collapsedFolders: {} };
let editing = null;
let pendingIconSave = null;
let pendingClearTimer = null;
let applyingIconSave = false;

function normalizeEnteredUrl(value) {
  const url = String(value || '').trim();
  if (!url) return '';
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(url)) return url;
  if (/^(chrome|edge|about):/i.test(url)) return url;
  return `https://${url}`;
}

function findNodeLocation(nodes, id) {
  for (let index = 0; index < (nodes || []).length; index += 1) {
    const node = nodes[index];
    if (node?.id === id) return { node, parent: nodes, index };
    if (node?.type === 'folder') {
      const found = findNodeLocation(node.children || [], id);
      if (found) return found;
    }
  }
  return null;
}

function matchesSearch(node, q) {
  if (!q) return true;
  const haystack = `${node?.title || ''} ${node?.url || ''}`.toLowerCase();
  if (haystack.includes(q)) return true;
  return node?.type === 'folder' && (node.children || []).some(child => matchesSearch(child, q));
}

function visibleTabNodes(nodes, q, out = []) {
  for (const node of nodes || []) {
    if (!matchesSearch(node, q)) continue;
    if (node.type === 'tab') out.push(node);
    if (node.type === 'folder') visibleTabNodes(node.children || [], q, out);
  }
  return out;
}

function replaceWithCustomIcon(container, icon, className) {
  if (!container || !icon) return;
  let custom = container.querySelector(`.${className}`);
  if (!custom) {
    custom = document.createElement('span');
    custom.className = className;
    custom.setAttribute('aria-hidden', 'true');
    const original = container.querySelector('img, .favicon-fallback');
    if (!original) return;
    original.replaceWith(custom);
  }
  custom.textContent = icon;
}

function decorateVisibleIcons() {
  const model = cachedModel;
  if (!model) return;

  const favoriteTiles = [...favoritesEl?.querySelectorAll('.favorite-tile') || []];
  favoriteTiles.forEach((tile, index) => {
    const icon = model.favorites?.[index]?.icon;
    if (icon) replaceWithCustomIcon(tile, icon, 'favorite-custom-icon');
  });

  if (cachedState.currentSpaceId === OPEN_TABS_SPACE_ID) return;
  const space = model.spaces?.find(candidate => candidate.id === cachedState.currentSpaceId) || model.spaces?.[0];
  if (!space) return;

  const q = searchEl?.value.trim().toLowerCase() || '';
  const nodes = visibleTabNodes(space.children || [], q);
  const rows = [...pinnedEl?.querySelectorAll('.row') || []];
  rows.forEach((row, index) => {
    const icon = nodes[index]?.icon;
    if (icon) replaceWithCustomIcon(row, icon, 'item-custom-icon');
  });
}

async function refreshCache() {
  const stored = await chrome.storage.local.get([STORAGE_KEY, STATE_KEY]);
  cachedModel = stored[STORAGE_KEY] || null;
  cachedState = { currentSpaceId: null, collapsedFolders: {}, ...(stored[STATE_KEY] || {}) };
  decorateVisibleIcons();
}

function currentIconForEditing() {
  if (!editing || !cachedModel) return '';
  if (editing.kind === 'favorite') return cachedModel.favorites?.[editing.index]?.icon || '';
  if (editing.kind === 'pinned') {
    for (const space of cachedModel.spaces || []) {
      const found = findNodeLocation(space.children || [], editing.id);
      if (found?.node?.type === 'tab') return found.node.icon || '';
    }
  }
  return '';
}

function createIconField() {
  const label = document.createElement('label');
  label.className = 'item-icon-field';
  label.innerHTML = `
    Icon
    <div class="item-icon-editor">
      <input id="itemIcon" class="item-icon-input" type="text" maxlength="8" autocomplete="off" placeholder="Site favicon">
      <button class="item-icon-clear" type="button" title="Use site favicon">Use favicon</button>
    </div>
    <div class="item-icon-grid" aria-label="Icon presets"></div>`;

  const input = label.querySelector('#itemIcon');
  const grid = label.querySelector('.item-icon-grid');
  const clear = label.querySelector('.item-icon-clear');

  for (const icon of ICON_PRESETS) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'item-icon-choice';
    button.textContent = icon;
    button.title = `Use ${icon}`;
    button.addEventListener('click', () => {
      input.value = icon;
      input.focus();
    });
    grid.append(button);
  }

  clear.addEventListener('click', () => {
    input.value = '';
    input.focus();
  });
  return label;
}

function showIconFieldWhenReady(attempt = 0) {
  const dialog = document.querySelector('.item-dialog');
  if (!dialog?.open) {
    if (attempt < 12) setTimeout(() => showIconFieldWhenReady(attempt + 1), 20);
    return;
  }

  const form = dialog.querySelector('.item-form');
  const urlInput = dialog.querySelector('#itemUrl');
  if (!form || !urlInput) return;

  let field = form.querySelector('.item-icon-field');
  if (!field) {
    field = createIconField();
    urlInput.closest('label')?.after(field);
  }
  const input = field.querySelector('#itemIcon');
  if (input) input.value = currentIconForEditing();
}

function setEditingFromTarget(target) {
  const favorite = target.closest?.('.favorite-tile');
  if (favorite && favoritesEl?.contains(favorite)) {
    editing = { kind: 'favorite', index: [...favoritesEl.querySelectorAll('.favorite-tile')].indexOf(favorite) };
    setTimeout(() => showIconFieldWhenReady(), 0);
    return true;
  }

  const row = target.closest?.('#pinned .row.managed-pinned');
  if (row?.dataset.nodeId) {
    editing = { kind: 'pinned', id: row.dataset.nodeId };
    setTimeout(() => showIconFieldWhenReady(), 0);
    return true;
  }
  return false;
}

function armPendingSave() {
  const dialog = document.querySelector('.item-dialog');
  const input = dialog?.querySelector('#itemIcon');
  if (!editing || !input) return;

  const normalizedUrl = normalizeEnteredUrl(dialog.querySelector('#itemUrl')?.value || '');
  const enteredTitle = dialog.querySelector('#itemTitle')?.value.trim() || '';
  pendingIconSave = {
    ...editing,
    icon: input.value.trim(),
    expectedUrl: normalizedUrl,
    expectedTitle: enteredTitle || normalizedUrl
  };

  if (pendingClearTimer) clearTimeout(pendingClearTimer);
  pendingClearTimer = setTimeout(() => {
    pendingIconSave = null;
    pendingClearTimer = null;
  }, 2500);
}

function applyIconValue(node, icon) {
  if (!node) return false;
  const current = node.icon || '';
  if (current === icon) return false;
  if (icon) node.icon = icon;
  else delete node.icon;
  return true;
}

async function applyPendingIconSave(modelFromChange) {
  if (!pendingIconSave || applyingIconSave || !modelFromChange) return;
  applyingIconSave = true;
  const pending = pendingIconSave;
  pendingIconSave = null;
  if (pendingClearTimer) clearTimeout(pendingClearTimer);
  pendingClearTimer = null;

  try {
    const model = structuredClone(modelFromChange);
    let changed = false;

    if (pending.kind === 'favorite') {
      changed = applyIconValue(model.favorites?.[pending.index], pending.icon);
    } else if (pending.kind === 'new-favorite') {
      const candidates = model.favorites || [];
      const item = [...candidates].reverse().find(candidate =>
        candidate?.type === 'tab' &&
        candidate.url === pending.expectedUrl &&
        candidate.title === pending.expectedTitle
      ) || candidates.at(-1);
      changed = applyIconValue(item, pending.icon);
    } else if (pending.kind === 'pinned') {
      for (const space of model.spaces || []) {
        const found = findNodeLocation(space.children || [], pending.id);
        if (found?.node?.type === 'tab') {
          changed = applyIconValue(found.node, pending.icon);
          break;
        }
      }
    } else if (pending.kind === 'new-pinned') {
      const state = await chrome.storage.local.get(STATE_KEY);
      const spaceId = state[STATE_KEY]?.currentSpaceId;
      const space = model.spaces?.find(candidate => candidate.id === spaceId) || model.spaces?.[0];
      const roots = space?.children || [];
      const item = [...roots].reverse().find(candidate =>
        candidate?.type === 'tab' &&
        candidate.url === pending.expectedUrl &&
        candidate.title === pending.expectedTitle
      ) || [...roots].reverse().find(candidate => candidate?.type === 'tab');
      changed = applyIconValue(item, pending.icon);
    }

    if (changed) await chrome.storage.local.set({ [STORAGE_KEY]: model });
  } finally {
    applyingIconSave = false;
  }
}

document.addEventListener('contextmenu', event => {
  setEditingFromTarget(event.target);
}, true);

addFavoriteButton?.addEventListener('click', () => {
  editing = { kind: 'new-favorite' };
  setTimeout(() => showIconFieldWhenReady(), 0);
}, true);

addPinnedButton?.addEventListener('click', () => {
  editing = { kind: 'new-pinned' };
  setTimeout(() => showIconFieldWhenReady(), 0);
}, true);

document.addEventListener('click', event => {
  if (event.target?.id === 'itemSave') armPendingSave();
}, true);

window.addEventListener('arc-sidebar-rendered', decorateVisibleIcons);
chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== 'local') return;

  if (changes[STORAGE_KEY]) {
    cachedModel = changes[STORAGE_KEY].newValue || null;
    if (pendingIconSave && !applyingIconSave) {
      applyPendingIconSave(changes[STORAGE_KEY].newValue).catch(() => {});
    }
  }
  if (changes[STATE_KEY]) {
    cachedState = { currentSpaceId: null, collapsedFolders: {}, ...(changes[STATE_KEY].newValue || {}) };
  }
  if (changes[STORAGE_KEY] || changes[STATE_KEY]) queueMicrotask(decorateVisibleIcons);
});

refreshCache().catch(() => {});
