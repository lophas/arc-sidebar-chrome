export const BACKUP_SETTING_KEYS = ['arcSidebarAutohideTimeout', 'arcSidebarMode', 'arcSidebarFavoriteSizePercent', 'arcSidebarOverlayWidth'];
const timeouts = new Set([0, 500, 600, 700, 800, 900, 1000, 1100]);
const sizes = new Set([80, 90, 100, 110, 120]);
export function exportBackupSettings(stored) {
  return {
    autohideTimeout: timeouts.has(stored.arcSidebarAutohideTimeout) ? stored.arcSidebarAutohideTimeout : stored.arcSidebarMode === 'native' ? 0 : 800,
    favoriteSizePercent: sizes.has(stored.arcSidebarFavoriteSizePercent) ? stored.arcSidebarFavoriteSizePercent : 100,
    sidebarWidth: Number.isFinite(stored.arcSidebarOverlayWidth) ? Math.max(120, Math.min(720, stored.arcSidebarOverlayWidth)) : 390
  };
}
export function restoreBackupSettings(settings) {
  if (settings === undefined) return {};
  if (!settings || typeof settings !== 'object' || Array.isArray(settings)) throw new Error('Invalid backup settings.');
  const values = {};
  if (Object.hasOwn(settings, 'autohideTimeout')) {
    if (!timeouts.has(settings.autohideTimeout)) throw new Error('Invalid backup autohide timeout.');
    values.arcSidebarAutohideTimeout = settings.autohideTimeout;
    values.arcSidebarMode = settings.autohideTimeout === 0 ? 'native' : 'overlay';
  }
  if (Object.hasOwn(settings, 'favoriteSizePercent')) {
    if (!sizes.has(settings.favoriteSizePercent)) throw new Error('Invalid backup Favorite size.');
    values.arcSidebarFavoriteSizePercent = settings.favoriteSizePercent;
  }
  if (Object.hasOwn(settings, 'sidebarWidth')) {
    if (!Number.isFinite(settings.sidebarWidth) || settings.sidebarWidth < 120 || settings.sidebarWidth > 720) throw new Error('Invalid backup sidebar width.');
    values.arcSidebarOverlayWidth = settings.sidebarWidth;
  }
  return values;
}
