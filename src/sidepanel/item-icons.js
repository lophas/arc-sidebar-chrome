const STORAGE_KEY = 'arcSidebarModel';
const STATE_KEY = 'arcSidebarState';
const OPEN_TABS_SPACE_ID = '__open_tabs__';

const favoritesEl = document.querySelector('#favorites');
const pinnedEl = document.querySelector('#pinned');
const searchEl = document.querySelector('#search');
const addFavoriteButton = document.querySelector('#addFavorite');
const addPinnedButton = document.querySelector('#addPinned');

const ICON_PRESETS = ['⭐','❤️','💬','📧','📅','📚','🧰','🖥️','🏠','🌐','📰','🎬','🎵','📷','🧭','✈️','🚗','💡','🔧','🧪'];
const IMAGE_ICON_PREFIX = 'data:image/';
const MAX_SOURCE_ICON_BYTES = 2 * 1024 * 1024;
const MAX_STORED_ICON_CHARS = 24000;
const ACCEPTED_ICON_TYPES = new Set(['image/svg+xml', 'image/png', 'image/webp', 'image/jpeg']);

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

function isImageIcon(value) {
  return typeof value === 'string' && value.startsWith(IMAGE_ICON_PREFIX);
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

  const wantsImage = isImageIcon(icon);
  let custom = container.querySelector(`.${className}`);
  const correctElement = custom && (wantsImage ? custom.tagName === 'IMG' : custom.tagName === 'SPAN');

  if (!correctElement) {
    const replacement = document.createElement(wantsImage ? 'img' : 'span');
    replacement.className = className;
    replacement.setAttribute('aria-hidden', 'true');
    if (wantsImage) replacement.classList.add('custom-icon-image');

    if (custom) {
      custom.replaceWith(replacement);
    } else {
      const original = container.querySelector('img, .favicon-fallback');
      if (!original) return;
      original.replaceWith(replacement);
    }
    custom = replacement;
  }

  if (wantsImage) {
    custom.src = icon;
    custom.alt = '';
  } else {
    custom.textContent = icon;
  }
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

function fileToImage(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => {
      URL.revokeObjectURL(url);
      resolve(image);
    };
    image.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('Could not read this image.'));
    };
    image.src = url;
  });
}

async function rasterizeIconFile(file, size) {
  const image = await fileToImage(file);
  const width = image.naturalWidth || image.width;
  const height = image.naturalHeight || image.height;
  if (!width || !height) throw new Error('Image has no usable dimensions.');

  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d', { alpha: true });
  const scale = Math.min(size / width, size / height);
  const drawWidth = Math.max(1, Math.round(width * scale));
  const drawHeight = Math.max(1, Math.round(height * scale));
  const x = Math.round((size - drawWidth) / 2);
  const y = Math.round((size - drawHeight) / 2);
  ctx.clearRect(0, 0, size, size);
  ctx.drawImage(image, x, y, drawWidth, drawHeight);
  return canvas.toDataURL('image/webp', 0.9);
}

async function prepareIconFile(file) {
  if (!file) throw new Error('No file selected.');
  if (file.size > MAX_SOURCE_ICON_BYTES) throw new Error('Icon file is too large. Maximum source size is 2 MB.');

  const type = file.type || '';
  const extensionOk = /\.(svg|png|webp|jpe?g)$/i.test(file.name || '');
  if (!ACCEPTED_ICON_TYPES.has(type) && !extensionOk) {
    throw new Error('Use an SVG, PNG, WebP or JPEG image.');
  }

  for (const size of [64, 48, 32]) {
    const dataUrl = await rasterizeIconFile(file, size);
    if (dataUrl.length <= MAX_STORED_ICON_CHARS) return dataUrl;
  }
  throw new Error('The icon could not be compressed enough for safe Sync/Backup storage.');
}

function setIconStatus(field, message, isError = false) {
  const status = field.querySelector('.item-icon-status');
  if (!status) return;
  status.textContent = message || '';
  status.classList.toggle('error', Boolean(isError));
}

function setImagePreview(field, icon, fileName = '') {
  const preview = field.querySelector('.item-icon-file-preview');
  const image = preview?.querySelector('img');
  const name = preview?.querySelector('span');
  if (!preview || !image || !name) return;

  if (isImageIcon(icon)) {
    image.src = icon;
    name.textContent = fileName || 'Custom image icon';
    preview.hidden = false;
  } else {
    image.removeAttribute('src');
    name.textContent = '';
    preview.hidden = true;
  }
}

function clearFileIcon(field) {
  delete field.dataset.fileIcon;
  setImagePreview(field, '');
}

async function selectIconFile(field, file) {
  const dropzone = field.querySelector('.item-icon-dropzone');
  const input = field.querySelector('#itemIcon');
  try {
    dropzone?.classList.add('busy');
    setIconStatus(field, 'Preparing icon…');
    const dataUrl = await prepareIconFile(file);
    field.dataset.fileIcon = dataUrl;
    if (input) input.value = '';
    setImagePreview(field, dataUrl, file.name || 'Custom image icon');
    setIconStatus(field, 'Image icon ready. Save to apply it.');
  } catch (error) {
    setIconStatus(field, error?.message || 'Could not use this icon.', true);
  } finally {
    dropzone?.classList.remove('busy');
  }
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
    <div class="item-icon-help">Type or paste any emoji/symbol, choose a preset, or drop an image file below.</div>
    <div class="item-icon-dropzone" role="button" tabindex="0" aria-label="Drop or choose a custom icon image">
      <strong>Drop icon here</strong>
      <span>SVG, PNG, WebP or JPEG · or click to choose</span>
      <input class="item-icon-file-input" type="file" accept="image/svg+xml,image/png,image/webp,image/jpeg" hidden>
    </div>
    <div class="item-icon-file-preview" hidden><img alt=""><span></span></div>
    <div class="item-icon-status" aria-live="polite"></div>
    <div class="item-icon-grid" aria-label="Icon presets"></div>`;

  const input = label.querySelector('#itemIcon');
  const grid = label.querySelector('.item-icon-grid');
  const clear = label.querySelector('.item-icon-clear');
  const dropzone = label.querySelector('.item-icon-dropzone');
  const fileInput = label.querySelector('.item-icon-file-input');

  for (const icon of ICON_PRESETS) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'item-icon-choice';
    button.textContent = icon;
    button.title = `Use ${icon}`;
    button.addEventListener('click', () => {
      clearFileIcon(label);
      input.value = icon;
      setIconStatus(label, '');
      input.focus();
    });
    grid.append(button);
  }

  input.addEventListener('input', () => {
    if (input.value) clearFileIcon(label);
    setIconStatus(label, '');
  });

  clear.addEventListener('click', () => {
    clearFileIcon(label);
    input.value = '';
    setIconStatus(label, 'Using the site favicon.');
    input.focus();
  });

  const chooseFile = () => fileInput.click();
  dropzone.addEventListener('click', chooseFile);
  dropzone.addEventListener('keydown', event => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      chooseFile();
    }
  });
  fileInput.addEventListener('click', event => event.stopPropagation());
  fileInput.addEventListener('change', () => {
    const file = fileInput.files?.[0];
    if (file) selectIconFile(label, file);
    fileInput.value = '';
  });

  for (const eventName of ['dragenter', 'dragover']) {
    dropzone.addEventListener(eventName, event => {
      event.preventDefault();
      event.stopPropagation();
      dropzone.classList.add('dragover');
      if (event.dataTransfer) event.dataTransfer.dropEffect = 'copy';
    });
  }
  for (const eventName of ['dragleave', 'drop']) {
    dropzone.addEventListener(eventName, event => {
      event.preventDefault();
      event.stopPropagation();
      dropzone.classList.remove('dragover');
    });
  }
  dropzone.addEventListener('drop', event => {
    const file = event.dataTransfer?.files?.[0];
    if (file) selectIconFile(label, file);
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
  const current = currentIconForEditing();
  clearFileIcon(field);
  setIconStatus(field, '');
  if (isImageIcon(current)) {
    field.dataset.fileIcon = current;
    if (input) input.value = '';
    setImagePreview(field, current, 'Current custom image icon');
  } else if (input) {
    input.value = current;
  }
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
  const field = dialog?.querySelector('.item-icon-field');
  const input = field?.querySelector('#itemIcon');
  if (!editing || !field || !input) return;

  const normalizedUrl = normalizeEnteredUrl(dialog.querySelector('#itemUrl')?.value || '');
  const enteredTitle = dialog.querySelector('#itemTitle')?.value.trim() || '';
  pendingIconSave = {
    ...editing,
    icon: field.dataset.fileIcon || input.value.trim(),
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

async function applyPendingExistingIconSave() {
  if (!pendingIconSave || !['favorite', 'pinned'].includes(pendingIconSave.kind)) return;
  const stored = await chrome.storage.local.get(STORAGE_KEY);
  if (stored[STORAGE_KEY]) await applyPendingIconSave(stored[STORAGE_KEY]);
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
  if (event.target?.id !== 'itemSave') return;
  armPendingSave();
  // Editing an existing item may not cause the base editor to write the model
  // when title/URL are unchanged. Apply the icon directly as a fallback so an
  // icon-only edit is still persisted. New items continue to wait for the base
  // editor's model write, because their node does not exist yet at click time.
  setTimeout(() => {
    applyPendingExistingIconSave().catch(error => {
      console.warn('Arc Sidebar: custom icon save fallback failed', error);
    });
  }, 80);
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
