import { autoPipSite, openAutoPipSiteSettings } from '../shared/auto-pip-settings.js';
import { isSidebarActive } from './lifecycle.js';

const button = document.querySelector('#autoPipSiteSettings');
const KEY = 'arcSidebarAutoPipEnabled';
const { id: windowId } = await chrome.windows.getCurrent();
let generation = 0;
let sourceTabId = null;
let opening = false;

async function refresh() {
  const token = ++generation;
  if (!isSidebarActive()) return;
  let tab, stored;
  try {
    [[tab], stored] = await Promise.all([
      chrome.tabs.query({ active: true, windowId }),
      chrome.storage.local.get(KEY)
    ]);
  } catch {
    if (token === generation) button.hidden = true;
    return;
  }
  if (token !== generation || !isSidebarActive()) return;
  sourceTabId = tab?.id;
  const site = stored[KEY] !== false && autoPipSite(tab);
  button.hidden = !site;
  if (site) {
    button.title = `Enable mini player for ${site.host} · Set Automatic picture-in-picture to Allow`;
    button.setAttribute('aria-label', button.title);
  }
}

function refreshSafely() {
  refresh().catch(() => { button.hidden = true; });
}

button.addEventListener('click', async () => {
  if (opening) return;
  opening = true;
  button.disabled = true;
  try {
    await openAutoPipSiteSettings(windowId);
  } catch (error) {
    window.dispatchEvent(new CustomEvent('arc-sidebar-save-error', {
      detail: { message: `Could not open mini player site settings: ${error.message}` }
    }));
  } finally {
    opening = false;
    button.disabled = false;
    refreshSafely();
  }
});

chrome.tabs.onActivated.addListener(event => {
  if (event.windowId !== windowId) return;
  button.hidden = true;
  refreshSafely();
});
chrome.tabs.onUpdated.addListener((tabId, info, tab) => {
  if (tab.windowId === windowId && tab.active && (info.url || info.status === 'complete')) refreshSafely();
});
chrome.tabs.onRemoved.addListener(tabId => {
  if (tabId === sourceTabId) { button.hidden = true; refreshSafely(); }
});
chrome.tabs.onReplaced.addListener((addedTabId, removedTabId) => {
  if (removedTabId === sourceTabId) refreshSafely();
});
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'local' && changes[KEY]) refreshSafely();
});
window.addEventListener('arc-sidebar-activity', event => {
  if (event.detail.active) refreshSafely();
  else { ++generation; button.hidden = true; }
});
refreshSafely();
