import { isSidebarActive } from './lifecycle.js';
import { createStorageClient } from '../shared/storage-client.js';
const sidebarStorage = createStorageClient({ isActive: isSidebarActive });
const STORAGE_KEY = 'arcSidebarModel';
const STATE_KEY = 'arcSidebarState';
const OPEN_TABS_SPACE_ID = '__open_tabs__';

const favoritesEl = document.querySelector('#favorites');
const pinnedEl = document.querySelector('#pinned');
const searchEl = document.querySelector('#search');

const IMAGE_ICON_PREFIX = 'data:image/';
const MAX_SOURCE_ICON_BYTES = 2 * 1024 * 1024;
const MAX_STORED_ICON_CHARS = 24000;
const ACCEPTED_ICON_TYPES = new Set(['image/svg+xml', 'image/png', 'image/webp', 'image/jpeg']);

let cachedModel = null;
let cachedState = { currentSpaceId: null, collapsedFolders: {} };
const iconRequests = new WeakMap();

function isImageIcon(value) {
  return typeof value === 'string' && value.startsWith(IMAGE_ICON_PREFIX);
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
    // Backward compatibility for older models that already contain symbol icons.
    custom.textContent = icon;
  }
}

function decorateVisibleIcons() {
  if (!isSidebarActive()) return;
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
  const stored = await sidebarStorage.local.get([STORAGE_KEY, STATE_KEY]);
  cachedModel = stored[STORAGE_KEY] || null;
  cachedState = { currentSpaceId: null, collapsedFolders: {}, ...(stored[STATE_KEY] || {}) };
  decorateVisibleIcons();
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
  iconRequests.delete(field);
  field.querySelector('.item-icon-dropzone')?.classList.remove('busy');
  field.closest('form').querySelector('#itemSave').disabled = false;
  delete field.dataset.fileIcon;
  setImagePreview(field, '');
}

async function selectIconFile(field, file) {
  const dropzone = field.querySelector('.item-icon-dropzone');
  const save = field.closest('form').querySelector('#itemSave');
  const request = {};
  iconRequests.set(field, request);
  try {
    save.disabled = true;
    dropzone?.classList.add('busy');
    setIconStatus(field, 'Preparing icon…');
    const dataUrl = await prepareIconFile(file);
    if (iconRequests.get(field) !== request) return;
    delete field.dataset.useFavicon;
    field.dataset.fileIcon = dataUrl;
    setImagePreview(field, dataUrl, file.name || 'Custom image icon');
    setIconStatus(field, 'Image icon ready. Save to apply it.');
  } catch (error) {
    if (iconRequests.get(field) !== request) return;
    setIconStatus(field, error?.message || 'Could not use this icon.', true);
  } finally {
    if (iconRequests.get(field) === request) {
      iconRequests.delete(field);
      dropzone?.classList.remove('busy');
      save.disabled = false;
    }
  }
}

function createIconField() {
  const label = document.createElement('div');
  label.className = 'item-icon-field';
  label.innerHTML = `
    <span>Icon</span>
    <div class="item-icon-actions">
      <button class="item-icon-clear" type="button" title="Use site favicon">Use favicon</button>
    </div>
    <div class="item-icon-dropzone" role="button" tabindex="0" aria-label="Drop or choose a custom icon image">
      <strong>Drop icon here</strong>
      <span>SVG, PNG, WebP or JPEG · or click to choose</span>
      <input class="item-icon-file-input" type="file" accept="image/svg+xml,image/png,image/webp,image/jpeg" hidden>
    </div>
    <div class="item-icon-file-preview" hidden><img alt=""><span></span></div>
    <div class="item-icon-status" aria-live="polite"></div>`;

  const clear = label.querySelector('.item-icon-clear');
  const dropzone = label.querySelector('.item-icon-dropzone');
  const fileInput = label.querySelector('.item-icon-file-input');

  clear.addEventListener('click', () => {
    clearFileIcon(label);
    label.dataset.useFavicon = '1';
    setIconStatus(label, 'Using the site favicon.');
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
    if (file) {
      selectIconFile(label, file);
    }
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
    if (file) {
      selectIconFile(label, file);
    }
  });

  return label;
}

// The link editor owns this field and saves its value in the same model update.
export function prepareItemIconEditor(form, item) {
  let field = form.querySelector('.item-icon-field');
  if (!field) {
    field = createIconField();
    form.querySelector('#itemUrl').closest('label').after(field);
  }
  clearFileIcon(field);
  delete field.dataset.useFavicon;
  setIconStatus(field, '');
  const current = item?.icon || '';
  if (isImageIcon(current)) {
    field.dataset.fileIcon = current;
    setImagePreview(field, current, 'Current custom image icon');
  } else if (current) {
    setIconStatus(field, 'This item has a legacy symbol icon. Upload an image or choose Use favicon to replace it.');
  }
}

export function applyItemIconEditor(form, item) {
  const field = form.querySelector('.item-icon-field');
  if (field?.dataset.useFavicon === '1') delete item.icon;
  else if (field?.dataset.fileIcon) item.icon = field.dataset.fileIcon;
}

window.addEventListener('arc-sidebar-rendered', decorateVisibleIcons);
chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== 'local') return;

  if (changes[STORAGE_KEY]) {
    cachedModel = changes[STORAGE_KEY].newValue || null;
  }
  if (changes[STATE_KEY]) {
    cachedState = { currentSpaceId: null, collapsedFolders: {}, ...(changes[STATE_KEY].newValue || {}) };
  }
  if (changes[STORAGE_KEY] || changes[STATE_KEY]) queueMicrotask(decorateVisibleIcons);
});

refreshCache().catch(() => {});
