import { isSidebarActive } from './lifecycle.js';
import { createStorageClient } from '../shared/storage-client.js';
import { FAVORITE_SIZE_KEY, DEFAULT_FAVORITE_SIZE, favoriteSize } from '../shared/favorite-size.js';
const sidebarStorage = createStorageClient({ isActive: isSidebarActive });

const BASE = {
  gridMin: 72,
  gap: 8,
  tileHeight: 58,
  radius: 13,
  icon: 24,
  iconRadius: 6,
  customBox: 32,
  customFont: 27
};

function px(value, scale) {
  return `${Math.round(value * scale * 10) / 10}px`;
}

function applyFavoriteSize(value) {
  const size = favoriteSize(value);
  const scale = size / 100;
  const root = document.documentElement;
  root.dataset.favoriteSize = String(size);
  root.style.setProperty('--favorite-grid-min', px(BASE.gridMin, scale));
  root.style.setProperty('--favorite-gap', px(BASE.gap, scale));
  root.style.setProperty('--favorite-tile-min-height', px(BASE.tileHeight, scale));
  root.style.setProperty('--favorite-tile-radius', px(BASE.radius, scale));
  root.style.setProperty('--favorite-icon-size', px(BASE.icon, scale));
  root.style.setProperty('--favorite-icon-radius', px(BASE.iconRadius, scale));
  root.style.setProperty('--favorite-custom-box', px(BASE.customBox, scale));
  root.style.setProperty('--favorite-custom-font', px(BASE.customFont, scale));
}

sidebarStorage.local.get(FAVORITE_SIZE_KEY)
  .then(stored => applyFavoriteSize(stored[FAVORITE_SIZE_KEY]))
  .catch(() => applyFavoriteSize(DEFAULT_FAVORITE_SIZE));

chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'local' && changes[FAVORITE_SIZE_KEY]) {
    applyFavoriteSize(changes[FAVORITE_SIZE_KEY].newValue);
  }
});
