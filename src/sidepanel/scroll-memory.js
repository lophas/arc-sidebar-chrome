const STATE_KEY = 'arcSidebarState';
const SCROLL_KEY = 'arcSidebarScrollPositions';
const OPEN_TABS_SPACE_ID = '__open_tabs__';

const scroller = document.querySelector('main');
let currentSpaceId = null;
let positions = {};
let saveTimer = null;
let restoreFrame = null;

function normalizedSpaceId(value) {
  return value || OPEN_TABS_SPACE_ID;
}

function restoreCurrentScroll() {
  if (!scroller) return;
  if (restoreFrame != null) cancelAnimationFrame(restoreFrame);
  restoreFrame = requestAnimationFrame(() => {
    restoreFrame = null;
    const key = normalizedSpaceId(currentSpaceId);
    const saved = Number(positions[key]) || 0;
    scroller.scrollTop = saved;
  });
}

function queueSave() {
  if (!scroller) return;
  const key = normalizedSpaceId(currentSpaceId);
  positions[key] = scroller.scrollTop;

  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    saveTimer = null;
    chrome.storage.local.set({ [SCROLL_KEY]: positions }).catch(() => {});
  }, 120);
}

async function init() {
  const stored = await chrome.storage.local.get([STATE_KEY, SCROLL_KEY]);
  currentSpaceId = stored[STATE_KEY]?.currentSpaceId || null;
  positions = stored[SCROLL_KEY] && typeof stored[SCROLL_KEY] === 'object'
    ? { ...stored[SCROLL_KEY] }
    : {};
  restoreCurrentScroll();
}

scroller?.addEventListener('scroll', queueSave, { passive: true });
window.addEventListener('arc-sidebar-rendered', restoreCurrentScroll);

chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== 'local') return;

  if (changes[STATE_KEY]) {
    currentSpaceId = changes[STATE_KEY].newValue?.currentSpaceId || null;
    restoreCurrentScroll();
  }

  if (changes[SCROLL_KEY] && !saveTimer) {
    positions = changes[SCROLL_KEY].newValue && typeof changes[SCROLL_KEY].newValue === 'object'
      ? { ...changes[SCROLL_KEY].newValue }
      : {};
  }
});

window.addEventListener('beforeunload', () => {
  if (!scroller) return;
  const key = normalizedSpaceId(currentSpaceId);
  positions[key] = scroller.scrollTop;
  chrome.storage.local.set({ [SCROLL_KEY]: positions }).catch(() => {});
}, { once: true });

init().catch(() => {});
