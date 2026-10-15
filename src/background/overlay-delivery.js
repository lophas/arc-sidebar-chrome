import { EDGE_TRIGGER_KEY, edgeTrigger } from '../shared/edge-trigger.js';
import { sidebarPreferences } from '../shared/sidebar-preferences.js';
import { canAutohideUrl } from '../shared/autohide-availability.js';
import { markAutohideBlocked } from './autohide-indicator.js';
const VERSION = 'edge-intent-v4';
const pending = new Map();
async function applyToTab(tabId) {
  const tab = await chrome.tabs.get(tabId);
  if (!canAutohideUrl(tab.pendingUrl || tab.url || '')) return;
  const stored = await chrome.storage.local.get(['arcSidebarMode', 'arcSidebarAutohideTimeout', EDGE_TRIGGER_KEY]);
  const preferences = { ...sidebarPreferences(stored), trigger: edgeTrigger(stored[EDGE_TRIGGER_KEY]) };
  const message = { type: 'arc-sidebar-apply-mode', ...preferences };
  let response;
  try { response = await chrome.tabs.sendMessage(tabId, message); } catch {}
  if (response?.version === VERSION) return;
  if (preferences.mode === 'native') {
    // A stale host can remain after an extension update even without a receiver.
    await chrome.scripting.executeScript({ target: { tabId }, func: () => document.getElementById('arc-sidebar-overlay-host')?.remove() });
    return;
  }
  await chrome.scripting.executeScript({ target: { tabId }, files: ['src/overlay/overlay.js'] });
  // Mode can change while injection waits for the page. Apply the latest value.
  const current = await chrome.storage.local.get(['arcSidebarMode', 'arcSidebarAutohideTimeout', EDGE_TRIGGER_KEY]);
  const latest = { ...sidebarPreferences(current), trigger: edgeTrigger(current[EDGE_TRIGGER_KEY]) };
  await chrome.tabs.sendMessage(tabId, { type: 'arc-sidebar-apply-mode', ...latest });
}
export function syncFocusedSidebar(tabId) {
  if (tabId == null) return Promise.resolve();
  const previous = pending.get(tabId) || Promise.resolve();
  const operation = previous.then(() => applyToTab(tabId)).catch(error => markAutohideBlocked(tabId, error));
  pending.set(tabId, operation);
  operation.finally(() => { if (pending.get(tabId) === operation) pending.delete(tabId); });
  return operation;
}
export async function refreshActiveSidebar(windowId) {
  const tabs = await chrome.tabs.query(windowId == null ? { active: true, lastFocusedWindow: true } : { active: true, windowId });
  await Promise.all(tabs.map(tab => syncFocusedSidebar(tab.id)));
}
chrome.tabs.onActivated.addListener(({ tabId }) => { syncFocusedSidebar(tabId); });
chrome.windows.onFocusChanged.addListener(windowId => {
  if (windowId >= 0) refreshActiveSidebar(windowId).catch(() => {});
});
chrome.tabs.onUpdated.addListener((tabId, info, tab) => {
  if (tab.active && (info.status === 'complete' || info.url)) syncFocusedSidebar(tabId);
});
// Also recover the current page when an unpacked extension is reloaded.
refreshActiveSidebar().catch(() => {});
