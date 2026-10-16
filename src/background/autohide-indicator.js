import { sidebarPreferences } from '../shared/sidebar-preferences.js';
import { canAutohideUrl } from '../shared/autohide-availability.js';
import { enlargeToolbarIcon } from './toolbar-icon.js';

const DEFAULT_TITLE = 'Open Arc Side of the Chrome';
const WARNING_TITLE = 'Autohide is unavailable on this page. Click to open the fixed sidebar.';
const states = new Map();
const blocked = new Set();
let tail = Promise.resolve();

async function apply(tab, autohide) {
  const url = tab.pendingUrl || tab.url;
  const warning = Boolean(autohide && url && (!canAutohideUrl(url) || blocked.has(tab.id)));
  if (states.get(tab.id) === warning) return;
  try {
    if (warning) {
      await chrome.action.setBadgeBackgroundColor({ tabId: tab.id, color: '#fbbf24' });
      await chrome.action.setBadgeTextColor({ tabId: tab.id, color: '#18181a' });
    }
    await chrome.action.setBadgeText({ tabId: tab.id, text: warning ? '!' : '' });
    await chrome.action.setTitle({ tabId: tab.id, title: warning ? WARNING_TITLE : DEFAULT_TITLE });
    states.set(tab.id, warning);
  } catch { /* A tab can close while its toolbar state is being updated. */ }
}

export function refreshAutohideIndicator(tabId, force = false) {
  // Read preferences inside the queue so a delayed navigation cannot restore a
  // warning after Fixed has been selected. No polling or page injection needed.
  tail = tail.then(async () => {
    const stored = await chrome.storage.local.get(['arcSidebarMode', 'arcSidebarAutohideTimeout']);
    const autohide = sidebarPreferences(stored).mode === 'overlay';
    const tabs = tabId == null ? await chrome.tabs.query({}) : [await chrome.tabs.get(tabId)];
    // A reload/update can reset Chrome's action after our initial module sweep.
    // Invalidate inside the queue so an earlier sweep cannot refill stale cache.
    if (force) for (const tab of tabs) states.delete(tab.id);
    await Promise.all(tabs.map(tab => apply(tab, autohide)));
  }).catch(() => {});
  return tail;
}

export function markAutohideBlocked(tabId, error) {
  // Error documents may retain an https URL. Only actual access restrictions
  // qualify; normal navigation races and closed tabs must not show a warning.
  if (!/cannot access|cannot be scripted|extensions gallery|chrome web store|missing host permission/i.test(error?.message || '')) return;
  blocked.add(tabId);
  return refreshAutohideIndicator(tabId);
}

chrome.tabs.onActivated.addListener(({ tabId }) => { refreshAutohideIndicator(tabId); });
chrome.tabs.onUpdated.addListener((tabId, info) => {
  if (info.url || info.status === 'loading') blocked.delete(tabId);
  if (info.url || info.status === 'loading' || info.status === 'complete') refreshAutohideIndicator(tabId);
});
chrome.tabs.onRemoved.addListener(tabId => { states.delete(tabId); blocked.delete(tabId); });
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'local' && (changes.arcSidebarMode || changes.arcSidebarAutohideTimeout)) refreshAutohideIndicator();
});
const recheckOpenTabs = () => refreshAutohideIndicator(undefined, true);
chrome.runtime.onInstalled.addListener(recheckOpenTabs);
chrome.runtime.onStartup.addListener(recheckOpenTabs);
refreshAutohideIndicator();
enlargeToolbarIcon().catch(error => console.warn('Arc Side of the Chrome: could not size the toolbar icon', error));
