const KEY = 'arcSidebarAutoPipEnabled';
const pending = new Map();
const activeTabs = new Map();
function isYouTube(tab) {
  try {
    const url = new URL(tab?.pendingUrl || tab?.url || '');
    return url.protocol === 'https:' && (url.hostname === 'youtube.com' || url.hostname.endsWith('.youtube.com'));
  } catch { return false; }
}
async function apply(tabId) {
  const tab = await chrome.tabs.get(tabId);
  if (!isYouTube(tab)) return;
  await chrome.scripting.executeScript({ target: { tabId }, world: 'MAIN', files: ['src/media/auto-pip.js'] });
  const stored = await chrome.storage.local.get(KEY);
  const current = await chrome.tabs.get(tabId);
  await chrome.scripting.executeScript({
    target: { tabId }, world: 'MAIN',
    func: (enabled, active) => globalThis.__arcSidebarAutoPip?.configure(enabled, active),
    args: [stored[KEY] !== false, current.active]
  });
}
function sync(tabId) {
  const operation = (pending.get(tabId) || Promise.resolve()).then(() => apply(tabId)).catch(() => {});
  pending.set(tabId, operation);
  operation.finally(() => { if (pending.get(tabId) === operation) pending.delete(tabId); });
  return operation;
}
async function syncAll() {
  const tabs = await chrome.tabs.query({});
  for (const tab of tabs) if (tab.active && !activeTabs.has(tab.windowId)) activeTabs.set(tab.windowId, tab.id);
  await Promise.all(tabs.filter(isYouTube).map(tab => sync(tab.id)));
}
chrome.runtime.onMessage.addListener((message, sender, respond) => {
  if (message?.type !== 'arc-auto-pip-ready') return;
  if (sender.id !== chrome.runtime.id || !isYouTube(sender.tab) || sender.tab?.id == null) { respond({ ok: false }); return; }
  sync(sender.tab.id).then(() => respond({ ok: true }));
  return true;
});
chrome.tabs.onActivated.addListener(({ tabId, windowId }) => {
  const previous = activeTabs.get(windowId);
  activeTabs.set(windowId, tabId);
  if (previous != null && previous !== tabId) sync(previous);
  sync(tabId);
});
chrome.windows.onRemoved.addListener(windowId => { activeTabs.delete(windowId); });
chrome.tabs.onUpdated.addListener((tabId, info, tab) => {
  if (isYouTube(tab) && (info.status === 'complete' || info.url)) sync(tabId);
});
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'local' && changes[KEY]) syncAll().catch(() => {});
});
syncAll().catch(() => {});
