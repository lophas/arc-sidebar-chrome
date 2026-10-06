const STORAGE_KEY = 'arcSidebarModel';
const IMAGE_ICON_PREFIX = 'data:image/';
const MAX_SOURCE_ICON_BYTES = 2 * 1024 * 1024;
const MAX_STORED_ICON_CHARS = 24000;
const ACCEPTED_ICON_TYPES = new Set(['image/svg+xml', 'image/png', 'image/webp', 'image/jpeg']);

let editingSpaceId = null;
let addingSpace = false;
let pendingSpaceIconSave = null;
let applyingSpaceIconSave = false;

function isImageIcon(value) {
  return typeof value === 'string' && value.startsWith(IMAGE_ICON_PREFIX);
}

function buildEmojiSet() {
  const values = new Set();
  const emojiRe = /(?:\p{Emoji_Presentation}|\p{Extended_Pictographic})/u;
  const modifierBaseRe = /\p{Emoji_Modifier_Base}/u;
  const skinTones = ['🏻','🏼','🏽','🏾','🏿'];

  const addRange = (start, end) => {
    for (let cp = start; cp <= end; cp += 1) {
      const char = String.fromCodePoint(cp);
      if (!emojiRe.test(char)) continue;
      values.add(char);
      if (modifierBaseRe.test(char)) {
        for (const tone of skinTones) values.add(char + tone);
      }
    }
  };

  addRange(0x203c, 0x3299);
  addRange(0x1f000, 0x1faff);

  for (const key of ['#','*','0','1','2','3','4','5','6','7','8','9']) {
    values.add(`${key}\uFE0F\u20E3`);
  }

  const regionals = [];
  for (let cp = 0x1f1e6; cp <= 0x1f1ff; cp += 1) regionals.push(String.fromCodePoint(cp));
  for (const a of regionals) for (const b of regionals) values.add(a + b);

  [
    '❤️','❣️','☀️','☁️','☕','✈️','⌛','⌚','⚙️','🛠️','🖥️','⌨️','🖱️','🕹️',
    '🏳️‍🌈','🏳️‍⚧️','🏴‍☠️','👁️‍🗨️','❤️‍🔥','❤️‍🩹','👨‍💻','👩‍💻','🧑‍💻',
    '👨‍🔧','👩‍🔧','🧑‍🔧','👨‍🏫','👩‍🏫','🧑‍🏫','👨‍⚕️','👩‍⚕️','🧑‍⚕️',
    '👨‍🍳','👩‍🍳','🧑‍🍳','👨‍🎨','👩‍🎨','🧑‍🎨','👨‍🚀','👩‍🚀','🧑‍🚀'
  ].forEach(value => values.add(value));

  return [...values];
}

const ALL_EMOJIS = buildEmojiSet();

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
  if (!ACCEPTED_ICON_TYPES.has(type) && !extensionOk) throw new Error('Use an SVG, PNG, WebP or JPEG image.');

  for (const size of [64, 48, 32]) {
    const dataUrl = await rasterizeIconFile(file, size);
    if (dataUrl.length <= MAX_STORED_ICON_CHARS) return dataUrl;
  }
  throw new Error('The icon could not be compressed enough for safe Sync/Backup storage.');
}

function setSpacePreview(dialog, value) {
  const preview = dialog.querySelector('#spaceIconPreview');
  if (!preview) return;
  if (isImageIcon(value)) {
    const image = document.createElement('img');
    image.src = value;
    image.alt = '';
    image.className = 'space-custom-image';
    preview.replaceChildren(image);
  } else {
    const emoji = dialog.querySelector('#spaceEmoji')?.value.trim() || '';
    const name = dialog.querySelector('#spaceName')?.value.trim() || '';
    preview.textContent = emoji || name.slice(0, 1).toUpperCase() || '•';
  }
}

function setStatus(dialog, text, error = false) {
  const status = dialog.querySelector('.space-icon-status');
  if (!status) return;
  status.textContent = text || '';
  status.classList.toggle('error', Boolean(error));
}

function setImageState(dialog, dataUrl = '', fileName = '') {
  if (dataUrl) dialog.dataset.spaceFileIcon = dataUrl;
  else delete dialog.dataset.spaceFileIcon;

  const preview = dialog.querySelector('.space-image-preview');
  const image = preview?.querySelector('img');
  const name = preview?.querySelector('span');
  if (preview && image && name) {
    if (dataUrl) {
      image.src = dataUrl;
      name.textContent = fileName || 'Custom image icon';
      preview.hidden = false;
    } else {
      image.removeAttribute('src');
      name.textContent = '';
      preview.hidden = true;
    }
  }
  setSpacePreview(dialog, dataUrl);
}

async function loadCurrentSpaceIcon(dialog) {
  if (!editingSpaceId) {
    setImageState(dialog, '');
    return;
  }
  const stored = await chrome.storage.local.get(STORAGE_KEY);
  const space = stored[STORAGE_KEY]?.spaces?.find(candidate => candidate.id === editingSpaceId);
  if (isImageIcon(space?.icon)) setImageState(dialog, space.icon, 'Current custom image icon');
  else setImageState(dialog, '');
}

function populateFullEmojiGrid(dialog) {
  const grid = dialog.querySelector('#spaceEmojiGrid');
  const input = dialog.querySelector('#spaceEmoji');
  if (!grid || !input || grid.dataset.fullEmojiSet === '1') return;

  grid.dataset.fullEmojiSet = '1';
  grid.replaceChildren();
  const fragment = document.createDocumentFragment();
  for (const emoji of ALL_EMOJIS) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'space-emoji-choice';
    button.textContent = emoji;
    button.title = emoji;
    button.addEventListener('click', () => {
      setImageState(dialog, '');
      input.value = emoji;
      setSpacePreview(dialog, '');
      grid.querySelectorAll('.selected').forEach(el => el.classList.remove('selected'));
      button.classList.add('selected');
      setStatus(dialog, '');
    });
    fragment.append(button);
  }
  grid.append(fragment);
}

function addImageControls(dialog) {
  const editor = dialog.querySelector('.space-icon-editor');
  if (!editor || editor.querySelector('.space-image-dropzone')) return;

  const wrap = document.createElement('div');
  wrap.className = 'space-image-controls';
  wrap.innerHTML = `
    <div class="space-image-separator">or use an image</div>
    <div class="space-image-dropzone" role="button" tabindex="0">
      <strong>Drop icon here</strong>
      <span>SVG, PNG, WebP or JPEG · or click to choose</span>
      <input class="space-image-file-input" type="file" accept="image/svg+xml,image/png,image/webp,image/jpeg" hidden>
    </div>
    <div class="space-image-preview" hidden><img alt=""><span></span></div>
    <div class="space-icon-status" aria-live="polite"></div>`;
  editor.append(wrap);

  const dropzone = wrap.querySelector('.space-image-dropzone');
  const fileInput = wrap.querySelector('.space-image-file-input');
  const emojiInput = dialog.querySelector('#spaceEmoji');
  const nameInput = dialog.querySelector('#spaceName');

  const useFile = async file => {
    try {
      dropzone.classList.add('busy');
      setStatus(dialog, 'Preparing icon…');
      const dataUrl = await prepareIconFile(file);
      if (emojiInput) emojiInput.value = '';
      dialog.querySelectorAll('.space-emoji-choice.selected').forEach(el => el.classList.remove('selected'));
      setImageState(dialog, dataUrl, file.name || 'Custom image icon');
      setStatus(dialog, 'Image icon ready. Save to apply it.');
    } catch (error) {
      setStatus(dialog, error?.message || 'Could not use this icon.', true);
    } finally {
      dropzone.classList.remove('busy');
    }
  };

  const choose = () => fileInput.click();
  dropzone.addEventListener('click', choose);
  dropzone.addEventListener('keydown', event => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      choose();
    }
  });
  fileInput.addEventListener('click', event => event.stopPropagation());
  fileInput.addEventListener('change', () => {
    const file = fileInput.files?.[0];
    if (file) useFile(file);
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
    if (file) useFile(file);
  });

  emojiInput?.addEventListener('input', () => {
    if (emojiInput.value.trim()) setImageState(dialog, '');
  });
  nameInput?.addEventListener('input', () => {
    const image = dialog.dataset.spaceFileIcon || '';
    if (image) setSpacePreview(dialog, image);
  });
}

async function enhanceSpaceDialog() {
  const dialog = document.querySelector('.space-dialog');
  if (!dialog?.open) return false;
  populateFullEmojiGrid(dialog);
  addImageControls(dialog);
  await loadCurrentSpaceIcon(dialog);
  return true;
}

function enhanceSpaceDialogWhenReady(attempt = 0) {
  setTimeout(async () => {
    const ok = await enhanceSpaceDialog().catch(() => false);
    if (!ok && attempt < 30) enhanceSpaceDialogWhenReady(attempt + 1);
  }, attempt === 0 ? 0 : 20);
}

async function decorateSpaceButtons() {
  const nav = document.querySelector('#spaces');
  if (!nav) return;
  const stored = await chrome.storage.local.get(STORAGE_KEY);
  const spaces = stored[STORAGE_KEY]?.spaces || [];
  const byId = new Map(spaces.map(space => [space.id, space]));

  for (const button of nav.querySelectorAll('.space-button[data-space-id]')) {
    const space = byId.get(button.dataset.spaceId);
    if (!isImageIcon(space?.icon)) continue;

    for (const node of [...button.childNodes]) {
      if (node.nodeType === Node.TEXT_NODE) node.remove();
    }
    let image = button.querySelector('.space-custom-image');
    if (!image) {
      image = document.createElement('img');
      image.className = 'space-custom-image';
      image.alt = '';
      button.prepend(image);
    }
    image.src = space.icon;
  }
}

function armSpaceSave() {
  const dialog = document.querySelector('.space-dialog');
  if (!dialog?.open) return;
  const title = dialog.querySelector('#spaceName')?.value.trim() || '';
  pendingSpaceIconSave = {
    id: editingSpaceId,
    adding: addingSpace,
    title,
    icon: dialog.dataset.spaceFileIcon || '',
    emoji: dialog.querySelector('#spaceEmoji')?.value.trim() || ''
  };
}

async function applyPendingSpaceIcon(modelFromChange) {
  if (!pendingSpaceIconSave || applyingSpaceIconSave || !modelFromChange) return;
  applyingSpaceIconSave = true;
  const pending = pendingSpaceIconSave;
  pendingSpaceIconSave = null;
  try {
    const model = structuredClone(modelFromChange);
    let space = pending.id ? model.spaces?.find(candidate => candidate.id === pending.id) : null;
    if (!space && pending.adding) {
      space = [...(model.spaces || [])].reverse().find(candidate => candidate.title === pending.title) || model.spaces?.at(-1);
    }
    if (!space) return;

    const oldIcon = space.icon || '';
    const oldEmoji = space.emoji || '';
    if (pending.icon) {
      space.icon = pending.icon;
      space.emoji = '';
    } else {
      delete space.icon;
      space.emoji = pending.emoji;
    }

    if ((space.icon || '') !== oldIcon || (space.emoji || '') !== oldEmoji) {
      await chrome.storage.local.set({ [STORAGE_KEY]: model });
    }
  } finally {
    applyingSpaceIconSave = false;
  }
}

async function applyPendingExistingSpaceIcon() {
  if (!pendingSpaceIconSave || pendingSpaceIconSave.adding) return;
  const stored = await chrome.storage.local.get(STORAGE_KEY);
  if (stored[STORAGE_KEY]) await applyPendingSpaceIcon(stored[STORAGE_KEY]);
}

document.addEventListener('contextmenu', event => {
  const button = event.target.closest?.('.space-button[data-space-id]');
  if (!button || button.classList.contains('space-add-button') || button.querySelector('.space-count')) return;
  editingSpaceId = button.dataset.spaceId || null;
  addingSpace = false;
  enhanceSpaceDialogWhenReady();
}, true);

document.addEventListener('click', event => {
  const add = event.target.closest?.('.space-add-button');
  if (add) {
    editingSpaceId = null;
    addingSpace = true;
    enhanceSpaceDialogWhenReady();
    return;
  }
  if (event.target?.id === 'spaceSave') {
    armSpaceSave();
    setTimeout(() => {
      applyPendingExistingSpaceIcon().catch(error => {
        console.warn('Arc Sidebar: Space image icon save fallback failed', error);
      });
    }, 80);
  }
}, true);

const dialogObserver = new MutationObserver(records => {
  for (const record of records) {
    if (record.type !== 'attributes' || record.attributeName !== 'open') continue;
    const dialog = record.target;
    if (dialog instanceof HTMLDialogElement && dialog.classList.contains('space-dialog') && dialog.open) {
      enhanceSpaceDialog().catch(() => {});
    }
  }
});
dialogObserver.observe(document.documentElement, { subtree: true, attributes: true, attributeFilter: ['open'] });

window.addEventListener('arc-sidebar-rendered', () => {
  queueMicrotask(() => decorateSpaceButtons().catch(() => {}));
});

chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== 'local' || !changes[STORAGE_KEY]) return;
  if (pendingSpaceIconSave && !applyingSpaceIconSave) {
    applyPendingSpaceIcon(changes[STORAGE_KEY].newValue).catch(() => {});
  }
  queueMicrotask(() => decorateSpaceButtons().catch(() => {}));
});

decorateSpaceButtons().catch(() => {});
