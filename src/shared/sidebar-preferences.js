export const AUTOHIDE_TIMEOUTS = [500, 600, 700, 800, 900, 1000, 1100];
export function sidebarPreferences(stored = {}) {
  const raw = stored.arcSidebarAutohideTimeout;
  const timeout = AUTOHIDE_TIMEOUTS.includes(raw) ? raw : 800;
  // Preserve legacy timeout-only preferences; a fresh profile starts fixed.
  const mode = raw === 0 ? 'native' : stored.arcSidebarMode === 'overlay' ? 'overlay' : stored.arcSidebarMode === 'native' ? 'native' : AUTOHIDE_TIMEOUTS.includes(raw) ? 'overlay' : 'native';
  return { mode, timeout };
}
