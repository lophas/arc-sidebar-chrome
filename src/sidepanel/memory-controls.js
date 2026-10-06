const STORAGE_KEY = 'arcSidebarModel';
const BINDINGS_KEY = 'arcSidebarBindings';

let menu = null;
let bypassContextMenu = false;
let decorateTimer = null;
let liveSpaceIds = new Set();

function collectTabIds(nodes, out = []) {
  for (const node of nodes || []) {
    if (node?.type === 'tab' && node.id) out.push(node.id);
    if (node?.type === 'folder') collectTabIds(node.children || [], out);
  }
  return out;
}

async function getModelAndBindings() {
  const [local, session] = await Promise.all([
    chrome.storage.local.get(STORAGE_KEY),
    chrome.storage.session.get(BINDINGS_KEY)
  ]);
  return {
    model: local[STORAGE_KEY],
    bindings: session[BINDINGS_KEY] || {}
  };
}

function liveItemIdsForNodes(nodes, bindings) {
  return collectTabIds(nodes || []).filter(itemId => bindings[itemId] != null);
}

async function closeBoundItems(itemIds) {
  if (!itemIds?.length) return;
  const session = await chrome.storage.session.get(BINDINGS_KEY);
  const bindings = session[BINDINGS_KEY] || {};
  const tabIds = [];
  let changed = false;

  for (const itemId of itemIds) {
    const tabId = bindings[itemId];
    if (tabId == null) continue;
    const numericTabId = Number(tabId);
    if (Number.isInteger(numericTabId)) tabIds.push(numericTabId);
    delete bindings[itemId];
    changed = true;
  }

  if (!changed) return;
  await chrome.storage.session.set({ [BINDINGS_KEY]: bindings });
  if (tabIds.length) {
    try { await chrome.tabs.remove([...new Set(tabIds)]); } catch {}
  }
}

function ensureMenu() {
  if (menu) return menu;
  menu = document.createElement('div');
  menu.className = 'sidebar-context-menu';
  menu.hidden = true;
  document.body.append(menu);
  return menu;
}

function hideMenu() {
  if (menu) menu.hidden = true;
}

function positionMenu(x, y) {
  const el = ensureMenu();
  el.style.left = `${x}px`;
  el.style.top = `${y}px`;
  el.hidden = false;

  requestAnimationFrame(() => {
    const rect = el.getBoundingClientRect();
    const left = Math.max(6, Math.min(x, window.innerWidth - rect.width - 6));
    const top = Math.max(6, Math.min(y, window.innerHeight - rect.height - 6));
    el.style.left = `${left}px`;
    el.style.top = `${top}px`;
  });
}

function addMenuButton(label, onClick, { danger = false } = {}) {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = danger ? 'danger' : '';
  button.textContent = label;
  button.addEventListener('click', async event => {
    event.preventDefault();
    event.stopPropagation();
    hideMenu();
    await onClick();
  });
  ensureMenu().append(button);
}

function replayExistingContextMenu(target, x, y) {
  bypassContextMenu = true;
  try {
    target.dispatchEvent(new MouseEvent('contextmenu', {
      bubbles: true,
      cancelable: true,
      view: window,
      clientX: x,
      clientY: y,
      button: 2,
      buttons: 2
    }));
  } finally {
    bypassContextMenu = false;
  }
}

async function showFolderMenu(header, x, y) {
  const folderId = header.dataset.folderEditId;
  if (!folderId) return;
  const { model, bindings } = await getModelAndBindings();
  const findFolder = nodes => {
    for (const node of nodes || []) {
      if (node?.type === 'folder' && node.id === folderId) return node;
      if (node?.type === 'folder') {
        const found = findFolder(node.children || []);
        if (found) return found;
      }
    }
    return null;
  };

  let folder = null;
  for (const space of model?.spaces || []) {
    folder = findFolder(space.children || []);
    if (folder) break;
  }
  if (!folder) return;

  const liveIds = liveItemIdsForNodes(folder.children || [], bindings);
  const el = ensureMenu();
  el.replaceChildren();
  addMenuButton('Edit folder…', () => replayExistingContextMenu(header, x, y));
  if (liveIds.length) {
    addMenuButton(`Close ${liveIds.length} open tab${liveIds.length === 1 ? '' : 's'}`, () => closeBoundItems(liveIds), { danger: true });
  }
  positionMenu(x, y);
}

async function showSpaceMenu(button, x, y) {
  const spaceId = button.dataset.spaceId;
  if (!spaceId || spaceId === '__open_tabs__') return;
  const { model, bindings } = await getModelAndBindings();
  const space = model?.spaces?.find(candidate => candidate.id === spaceId);
  if (!space) return;

  const liveIds = liveItemIdsForNodes(space.children || [], bindings);
  const el = ensureMenu();
  el.replaceChildren();
  addMenuButton('Edit Space…', () => replayExistingContextMenu(button, x, y));
  if (liveIds.length) {
    addMenuButton(`Close ${liveIds.length} open tab${liveIds.length === 1 ? '' : 's'}`, () => closeBoundItems(liveIds), { danger: true });
  }
  positionMenu(x, y);
}

function decorateImmediateLiveDots() {
  document.querySelectorAll('.row.has-binding .reset-pinned').forEach(button => {
    button.classList.add('live-dot-close');
    button.textContent = '';
    button.title = 'Close tab';
  });

  document.querySelectorAll('.favorite-tile.has-binding').forEach(tile => {
    tile.querySelector('.favorite-live-dot')?.remove();
    const button = tile.querySelector('.favorite-reset');
    if (!button) return;
    button.classList.add('live-dot-close');
    button.textContent = '';
    button.title = 'Close tab';
  });

  for (const button of document.querySelectorAll('.space-button[data-space-id]')) {
    const spaceId = button.dataset.spaceId;
    if (!spaceId || spaceId === '__open_tabs__') continue;
    let dot = button.querySelector('.space-live-dot');
    if (!liveSpaceIds.has(spaceId)) {
      dot?.remove();
      continue;
    }
    if (!dot) {
      dot = document.createElement('span');
      dot.className = 'space-live-dot';
      dot.setAttribute('aria-hidden', 'true');
      button.append(dot);
    }
  }
}

async function decorateMemoryControls() {
  const { model, bindings } = await getModelAndBindings();

  liveSpaceIds = new Set();
  for (const space of model?.spaces || []) {
    if (liveItemIdsForNodes(space.children || [], bindings).length) liveSpaceIds.add(space.id);
  }

  decorateImmediateLiveDots();
  document.querySelectorAll('.folder-reset').forEach(button => button.remove());
}

function scheduleDecorate() {
  decorateImmediateLiveDots();
  if (decorateTimer) clearTimeout(decorateTimer);
  decorateTimer = setTimeout(() => {
    decorateTimer = null;
    decorateMemoryControls().catch(() => {});
  }, 0);
}

document.addEventListener('contextmenu', event => {
  if (bypassContextMenu) return;

  const folderHeader = event.target.closest?.('.folder-header.managed-folder');
  if (folderHeader) {
    event.preventDefault();
    event.stopImmediatePropagation();
    showFolderMenu(folderHeader, event.clientX, event.clientY).catch(() => {});
    return;
  }

  const spaceButton = event.target.closest?.('.space-button[data-space-id]');
  if (spaceButton && !spaceButton.classList.contains('space-add-button') && spaceButton.dataset.spaceId !== '__open_tabs__') {
    event.preventDefault();
    event.stopImmediatePropagation();
    showSpaceMenu(spaceButton, event.clientX, event.clientY).catch(() => {});
  }
}, true);

document.addEventListener('pointerdown', event => {
  if (menu && !menu.hidden && !menu.contains(event.target)) hideMenu();
}, true);
window.addEventListener('blur', hideMenu);
window.addEventListener('resize', hideMenu);
document.addEventListener('scroll', hideMenu, true);
window.addEventListener('arc-sidebar-rendered', scheduleDecorate);
chrome.storage.onChanged.addListener((changes, area) => {
  if ((area === 'session' && changes[BINDINGS_KEY]) || (area === 'local' && changes[STORAGE_KEY])) scheduleDecorate();
});

scheduleDecorate();
