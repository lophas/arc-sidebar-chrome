import { createStorageClient } from '../shared/storage-client.js';
import { isSidebarActive } from './lifecycle.js';
const sidebarStorage = createStorageClient({ isActive: isSidebarActive });
const STATE_KEY = 'arcSidebarState', SCROLL_KEY = 'arcSidebarScrollPositions';
const scroller = document.querySelector('main');
let currentSpaceId = '__open_tabs__', positions = {}, saveTimer = null, restoreFrame = null;
let pending = null, restoring = false, restoreGeneration = 0;
async function flush() {
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = null;
  if (!pending) return;
  const value = pending; pending = null;
  await sidebarStorage.local.patch(SCROLL_KEY, { [value.spaceId]: value.top });
}
function restoreCurrentScroll() {
  if (!scroller || !isSidebarActive()) return;
  if (restoreFrame != null) cancelAnimationFrame(restoreFrame);
  const token = ++restoreGeneration;
  restoring = true;
  restoreFrame = requestAnimationFrame(() => {
    restoreFrame = null;
    scroller.scrollTop = Number(positions[currentSpaceId]) || 0;
    requestAnimationFrame(() => { if (token === restoreGeneration) restoring = false; });
  });
}
function queueSave() {
  if (!scroller || !isSidebarActive() || restoring) return;
  pending = { spaceId: currentSpaceId, top: scroller.scrollTop };
  positions[currentSpaceId] = pending.top;
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(() => flush().catch(console.warn), 120);
}
async function refresh() {
  const stored = await sidebarStorage.local.get([STATE_KEY, SCROLL_KEY]);
  currentSpaceId = stored[STATE_KEY]?.currentSpaceId || '__open_tabs__';
  positions = stored[SCROLL_KEY] || {};
  restoreCurrentScroll();
}
scroller?.addEventListener('scroll', queueSave, { passive: true });
window.addEventListener('arc-sidebar-rendered', restoreCurrentScroll);
chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== 'local') return;
  if (changes[SCROLL_KEY]) {
    positions = changes[SCROLL_KEY].newValue || {};
    if (pending) positions = { ...positions, [pending.spaceId]: pending.top };
  }
  if (changes[STATE_KEY]) {
    flush().catch(console.warn); // Captured Space ID, not the newly selected Space.
    currentSpaceId = changes[STATE_KEY].newValue?.currentSpaceId || '__open_tabs__';
    restoreCurrentScroll();
  } else if (changes[SCROLL_KEY] && !pending) restoreCurrentScroll();
});
window.addEventListener('arc-sidebar-activity', event => {
  if (event.detail.active) refresh().catch(console.warn);
  else { flush().catch(console.warn); if (restoreFrame != null) cancelAnimationFrame(restoreFrame); restoreFrame = null; ++restoreGeneration; restoring = false; }
});
window.addEventListener('pagehide', () => flush().catch(() => {}));
if (isSidebarActive()) refresh().catch(console.warn);
