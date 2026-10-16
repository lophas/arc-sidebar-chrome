import { createStorageClient } from '../shared/storage-client.js';
import { FAVORITE_SIZE_KEY, DEFAULT_FAVORITE_SIZE, favoriteSize } from '../shared/favorite-size.js';
const sidebarStorage = createStorageClient();
const slider = document.querySelector('#favoriteSize');
const output = document.querySelector('#favoriteSizeValue');
const status = document.querySelector('#favoriteSizeStatus');
let revision = 0, loading = 0, pending = 0, dirty = false;
let saveTail = Promise.resolve();

function paint(value = slider.value) {
  const size = favoriteSize(value);
  slider.value = String(size);
  output.value = `${size}%`;
  slider.setAttribute('aria-valuetext', output.value);
  return size;
}

async function loadFavoriteSize() {
  const request = ++loading, before = revision;
  const stored = await sidebarStorage.local.get(FAVORITE_SIZE_KEY);
  if (request !== loading || before !== revision || pending || dirty) return;
  paint(stored[FAVORITE_SIZE_KEY]);
}

slider.addEventListener('input', () => { revision++; dirty = true; paint(); });
slider.addEventListener('change', () => {
  const size = paint(), savedRevision = ++revision;
  dirty = false;
  pending++;
  saveTail = saveTail.then(async () => {
    await sidebarStorage.local.set({ [FAVORITE_SIZE_KEY]: size });
    if (savedRevision === revision) status.textContent = `Favorite size saved on this computer: ${size}%.`;
  }).catch(error => {
    console.error(error);
    if (savedRevision === revision) status.textContent = `Could not save Favorite size: ${error.message}`;
  }).finally(() => {
    pending--;
    if (!pending) return loadFavoriteSize().catch(console.error);
  });
});

chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'local' && changes[FAVORITE_SIZE_KEY]) loadFavoriteSize().catch(console.error);
});

loadFavoriteSize().catch(error => {
  console.error(error);
  if (!revision) paint(DEFAULT_FAVORITE_SIZE);
  status.textContent = 'Could not load Favorite size.';
});
