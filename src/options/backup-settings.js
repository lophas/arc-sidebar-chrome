import { EDGE_TRIGGER_KEY, edgeTrigger, isEdgeTrigger } from '../shared/edge-trigger.js';
import { sidebarPreferences, AUTOHIDE_TIMEOUTS } from '../shared/sidebar-preferences.js';
import { favoriteSize, isFavoriteSize } from '../shared/favorite-size.js';
import { DISCARD_MINUTES_KEY, DISCARD_EXCEPTIONS_KEY, discardPreferences, isDiscardMinutes, discardExceptions } from '../shared/auto-discard.js';
export const BACKUP_SETTING_KEYS = ['arcSidebarAutohideTimeout', 'arcSidebarMode', 'arcSidebarFavoriteSizePercent', 'arcSidebarOverlayWidth', 'arcSidebarAutoPipEnabled', EDGE_TRIGGER_KEY, DISCARD_MINUTES_KEY, DISCARD_EXCEPTIONS_KEY];
const timeouts = new Set([0, ...AUTOHIDE_TIMEOUTS]);
export function exportBackupSettings(stored) {
  return {
    autoDiscard: discardPreferences(stored),
    edgeTrigger: edgeTrigger(stored[EDGE_TRIGGER_KEY]),
    autoPipEnabled: stored.arcSidebarAutoPipEnabled !== false,
    autohideTimeout: sidebarPreferences(stored).timeout,
    sidebarMode: sidebarPreferences(stored).mode,
    favoriteSizePercent: favoriteSize(stored.arcSidebarFavoriteSizePercent),
    sidebarWidth: Number.isFinite(stored.arcSidebarOverlayWidth) ? Math.max(120, Math.min(720, stored.arcSidebarOverlayWidth)) : 390
  };
}
export function restoreBackupSettings(settings) {
  if (settings === undefined) return {};
  if (!settings || typeof settings !== 'object' || Array.isArray(settings)) throw new Error('Invalid backup settings.');
  const values = {};
  if (Object.hasOwn(settings, 'autoDiscard')) {
    const config = settings.autoDiscard;
    if (!config || !isDiscardMinutes(config.minutes) || !Array.isArray(config.exceptions)) throw new Error('Invalid backup automatic discard settings.');
    values[DISCARD_MINUTES_KEY] = config.minutes;
    values[DISCARD_EXCEPTIONS_KEY] = discardExceptions(config.exceptions);
  }
  if (Object.hasOwn(settings, 'edgeTrigger')) {
    if (!isEdgeTrigger(settings.edgeTrigger)) throw new Error('Invalid backup edge trigger.');
    values[EDGE_TRIGGER_KEY] = edgeTrigger(settings.edgeTrigger);
  }
  if (Object.hasOwn(settings, 'autoPipEnabled')) {
    if (typeof settings.autoPipEnabled !== 'boolean') throw new Error('Invalid backup mini player setting.');
    values.arcSidebarAutoPipEnabled = settings.autoPipEnabled;
  }
  if (Object.hasOwn(settings, 'autohideTimeout')) {
    if (!timeouts.has(settings.autohideTimeout)) throw new Error('Invalid backup autohide timeout.');
    values.arcSidebarAutohideTimeout = settings.autohideTimeout || 800;
    values.arcSidebarMode = settings.autohideTimeout === 0 ? 'native' : 'overlay';
  }
  if (Object.hasOwn(settings, 'sidebarMode')) {
    if (!['native', 'overlay'].includes(settings.sidebarMode)) throw new Error('Invalid backup sidebar mode.');
    values.arcSidebarMode = settings.sidebarMode;
  }
  if (Object.hasOwn(settings, 'favoriteSizePercent')) {
    if (!isFavoriteSize(settings.favoriteSizePercent)) throw new Error('Invalid backup Favorite size.');
    values.arcSidebarFavoriteSizePercent = settings.favoriteSizePercent;
  }
  if (Object.hasOwn(settings, 'sidebarWidth')) {
    if (!Number.isFinite(settings.sidebarWidth) || settings.sidebarWidth < 120 || settings.sidebarWidth > 720) throw new Error('Invalid backup sidebar width.');
    values.arcSidebarOverlayWidth = settings.sidebarWidth;
  }
  return values;
}
