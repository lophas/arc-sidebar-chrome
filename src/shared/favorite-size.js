// Device-local preference; portable backups include it, Chrome Sync does not.
export const FAVORITE_SIZE_KEY = 'arcSidebarFavoriteSizePercent';
export const DEFAULT_FAVORITE_SIZE = 100;

export function isFavoriteSize(value) {
  return Number.isInteger(value) && value >= 50 && value <= 150 && value % 10 === 0;
}

export function favoriteSize(value) {
  const size = Number(value);
  return isFavoriteSize(size) ? size : DEFAULT_FAVORITE_SIZE;
}
