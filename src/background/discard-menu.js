export const DISCARD_MENU = 'arc-sidebar-keep-in-memory';
export async function refreshDiscardMenu(tab) {
  try {
    if (!tab) [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
    await chrome.contextMenus.update(DISCARD_MENU, {
      checked: tab?.autoDiscardable === false,
      enabled: Boolean(tab && !tab.pinned && /^https?:\/\//i.test(tab.url || ''))
    });
  } catch { /* Menus can be rebuilt while focus changes. */ }
}
chrome.tabs.onActivated.addListener(info => { chrome.tabs.get(info.tabId).then(refreshDiscardMenu).catch(() => {}); });
chrome.tabs.onUpdated.addListener((id, info, tab) => {
  if (tab.active && ('autoDiscardable' in info || 'pinned' in info || info.url)) refreshDiscardMenu(tab);
});
chrome.windows.onFocusChanged.addListener(() => { refreshDiscardMenu(); });
chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (info.menuItemId !== DISCARD_MENU || !tab || tab.pinned) return;
  try {
    const current = await chrome.tabs.get(tab.id);
    if (current.pinned) return;
    await chrome.tabs.update(tab.id, { autoDiscardable: !info.checked });
    await refreshDiscardMenu();
  } catch (error) { console.warn('Arc Side of the Chrome: could not protect tab', error); }
});
