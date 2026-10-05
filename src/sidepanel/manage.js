const STORAGE_KEY = 'arcSidebarModel';
const favoritesEl = document.querySelector('#favorites');

let dragIndex = null;
let dialog = null;

function uid() {
  return crypto.randomUUID ? crypto.randomUUID() : `local-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

async function getModel() {
  const stored = await chrome.storage.local.get(STORAGE_KEY);
  return stored[STORAGE_KEY] || { version: 2, favorites: [], spaces: [], stats: { spaces: 0, folders: 0, tabs: 0, favorites: 0 } };
}

async function saveModel(model) {
  model.stats ||= { spaces: model.spaces?.length || 0, folders: 0, tabs: 0, favorites: 0 };
  model.stats.favorites = model.favorites?.length || 0;
  await chrome.storage.local.set({ [STORAGE_KEY]: model });
  location.reload();
}

function ensureDialog() {
  if (dialog) return dialog;
  dialog = document.createElement('dialog');
  dialog.className = 'item-dialog';
  dialog.innerHTML = `
    <form method="dialog" class="item-form">
      <h3 id="itemDialogTitle">Favorite</h3>
      <label>Title<input id="favoriteTitle" type="text" autocomplete="off"></label>
      <label>URL<input id="favoriteUrl" type="url" autocomplete="off" required></label>
      <div class="dialog-actions">
        <button id="favoriteDelete" class="danger" type="button">Delete</button>
        <span class="dialog-spacer"></span>
        <button value="cancel">Cancel</button>
        <button id="favoriteSave" class="primary" type="button">Save</button>
      </div>
    </form>`;
  document.body.append(dialog);
  return dialog;
}

async function openFavoriteEditor(index = null) {
  const model = await getModel();
  model.favorites ||= [];
  const item = index == null ? null : model.favorites[index];
  const d = ensureDialog();
  d.querySelector('#itemDialogTitle').textContent = item ? 'Edit favorite' : 'Add favorite';
  d.querySelector('#favoriteTitle').value = item?.title || '';
  d.querySelector('#favoriteUrl').value = item?.url || '';
  d.querySelector('#favoriteDelete').style.display = item ? '' : 'none';

  d.querySelector('#favoriteSave').onclick = async () => {
    const title = d.querySelector('#favoriteTitle').value.trim();
    const url = d.querySelector('#favoriteUrl').value.trim();
    if (!url) return;
    try { new URL(url); } catch { d.querySelector('#favoriteUrl').reportValidity(); return; }
    const next = { type: 'tab', id: item?.id || uid(), title: title || url, url };
    if (item) model.favorites[index] = next;
    else model.favorites.push(next);
    d.close();
    await saveModel(model);
  };

  d.querySelector('#favoriteDelete').onclick = async () => {
    if (!item) return;
    model.favorites.splice(index, 1);
    d.close();
    await saveModel(model);
  };

  d.showModal();
  setTimeout(() => (item ? d.querySelector('#favoriteTitle') : d.querySelector('#favoriteUrl')).focus(), 0);
}

function favoriteTiles() {
  return [...favoritesEl.querySelectorAll('.favorite-tile:not(.favorite-add-tile)')];
}

function decorateFavorites() {
  if (!favoritesEl) return;

  const tiles = favoriteTiles();
  tiles.forEach((tile, index) => {
    if (tile.dataset.managed === '1') return;
    tile.dataset.managed = '1';
    tile.draggable = true;
    tile.addEventListener('contextmenu', event => {
      event.preventDefault();
      openFavoriteEditor(index);
    });
    tile.addEventListener('dragstart', event => {
      dragIndex = favoriteTiles().indexOf(tile);
      tile.classList.add('dragging');
      event.dataTransfer.effectAllowed = 'move';
    });
    tile.addEventListener('dragend', () => {
      tile.classList.remove('dragging');
      dragIndex = null;
    });
    tile.addEventListener('dragover', event => {
      event.preventDefault();
      event.dataTransfer.dropEffect = 'move';
    });
    tile.addEventListener('drop', async event => {
      event.preventDefault();
      const targetIndex = favoriteTiles().indexOf(tile);
      if (dragIndex == null || targetIndex < 0 || dragIndex === targetIndex) return;
      const model = await getModel();
      const [moved] = model.favorites.splice(dragIndex, 1);
      model.favorites.splice(targetIndex, 0, moved);
      await saveModel(model);
    });
  });

  let add = favoritesEl.querySelector('.favorite-add-tile');
  if (!add) {
    add = document.createElement('button');
    add.type = 'button';
    add.className = 'favorite-tile favorite-add-tile';
    add.title = 'Add favorite';
    add.setAttribute('aria-label', 'Add favorite');
    add.textContent = '+';
    add.addEventListener('click', () => openFavoriteEditor(null));
    favoritesEl.append(add);
  }
}

const observer = new MutationObserver(() => queueMicrotask(decorateFavorites));
if (favoritesEl) {
  observer.observe(favoritesEl, { childList: true });
  decorateFavorites();
}

chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'local' && changes[STORAGE_KEY]) location.reload();
});
