const KEY = 'arcSidebarAutoPipEnabled';
const pending = new Map();
const activeTabs = new Map();
function supportsAutoPip(tab) {
  try {
    const url = new URL(tab?.pendingUrl || tab?.url || '');
    // Chrome's automatic media PiP is available on secure web pages.
    return url.protocol === 'https:';
  } catch { return false; }
}
async function apply(tabId, activatedAt) {
  const tab = await chrome.tabs.get(tabId);
  if (!supportsAutoPip(tab)) return;
  await chrome.scripting.executeScript({ target: { tabId }, world: 'MAIN', files: ['src/media/auto-pip.js'] });
  const stored = await chrome.storage.local.get(KEY);
  const current = await chrome.tabs.get(tabId);
  await chrome.scripting.executeScript({
    target: { tabId }, world: 'MAIN',
    func: (enabled, active, activatedAt) => globalThis.__arcSidebarAutoPip?.configure(enabled, active, activatedAt),
    // Preserve WHEN activation happened, rather than converting an old queued
    // event into a new activation after asynchronous injection/storage reads.
    args: [stored[KEY] !== false, current.active, current.active && activeTabs.get(current.windowId) === tabId ? activatedAt : 0]
  });
}
function sync(tabId, activatedAt = 0) {
  const operation = (pending.get(tabId) || Promise.resolve()).then(() => apply(tabId, activatedAt)).catch(() => {});
  pending.set(tabId, operation);
  operation.finally(() => { if (pending.get(tabId) === operation) pending.delete(tabId); });
  return operation;
}
async function syncAll() {
  const tabs = await chrome.tabs.query({});
  for (const tab of tabs) if (tab.active && !activeTabs.has(tab.windowId)) activeTabs.set(tab.windowId, tab.id);
  await Promise.all(tabs.filter(supportsAutoPip).map(tab => sync(tab.id)));
}
chrome.runtime.onMessage.addListener((message, sender, respond) => {
  if (message?.type !== 'arc-auto-pip-ready') return;
  if (sender.id !== chrome.runtime.id || sender.frameId !== 0 || !supportsAutoPip(sender.tab) || sender.tab?.id == null) { respond({ ok: false }); return; }
  sync(sender.tab.id).then(() => respond({ ok: true }));
  return true;
});
chrome.tabs.onActivated.addListener(({ tabId, windowId }) => {
  const activatedAt = Date.now();
  const previous = activeTabs.get(windowId);
  activeTabs.set(windowId, tabId);
  if (previous != null && previous !== tabId) sync(previous);
  sync(tabId, activatedAt);
});
chrome.windows.onRemoved.addListener(windowId => { activeTabs.delete(windowId); });
chrome.tabs.onUpdated.addListener((tabId, info, tab) => {
  if (supportsAutoPip(tab) && (info.status === 'complete' || info.url)) sync(tabId);
});
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'local' && changes[KEY]) syncAll().catch(() => {});
});
syncAll().catch(() => {});
