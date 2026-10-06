const FAVORITE_SIZE_KEY = 'arcSidebarFavoriteSizePercent';
const ALLOWED_SIZES = new Set([80, 90, 100, 110, 120]);
const DEFAULT_SIZE = 100;

const select = document.querySelector('#favoriteSize');
const status = document.querySelector('#favoriteSizeStatus');

function normalizeSize(value) {
  const size = Number(value);
  return ALLOWED_SIZES.has(size) ? size : DEFAULT_SIZE;
}

async function loadFavoriteSize() {
  const stored = await chrome.storage.local.get(FAVORITE_SIZE_KEY);
  const size = normalizeSize(stored[FAVORITE_SIZE_KEY]);
  select.value = String(size);
  status.textContent = size === DEFAULT_SIZE ? 'Using the original Favorite size.' : `Favorite size set to ${size}%.`;
}

select.addEventListener('change', async () => {
  const size = normalizeSize(select.value);
  select.disabled = true;
  try {
    await chrome.storage.local.set({ [FAVORITE_SIZE_KEY]: size });
    status.textContent = size === DEFAULT_SIZE ? 'Using the original Favorite size.' : `Favorite size set to ${size}%.`;
  } catch (error) {
    console.error(error);
    status.textContent = `Could not save Favorite size: ${error.message}`;
    await loadFavoriteSize();
  } finally {
    select.disabled = false;
  }
});

chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'local' && changes[FAVORITE_SIZE_KEY]) loadFavoriteSize().catch(() => {});
});

loadFavoriteSize().catch(error => {
  console.error(error);
  select.value = String(DEFAULT_SIZE);
  status.textContent = 'Using the original Favorite size.';
});
