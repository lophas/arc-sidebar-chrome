import { serializeState } from './state-controller.js';

const KEY = 'arcSidebarWindowPlaceholders';
const isNewTab = url => !url || ['about:blank', 'chrome://newtab', 'chrome://new-tab-page', 'chrome://new-tab-page-third-party', 'chrome-search://local-ntp/local-ntp.html']
  .includes(url.split(/[?#]/)[0].replace(/\/$/, ''));
const read = async () => (await chrome.storage.session.get(KEY))[KEY] || {};

async function forget(tabId) {
  const placeholders = await read();
  if (!(tabId in placeholders)) return;
  delete placeholders[tabId];
  await chrome.storage.session.set({ [KEY]: placeholders });
}

// These helpers run inside the shared tab/state queue. Session storage retains
// ownership across service-worker sleeps without claiming user-created tabs.
export async function createWindowPlaceholder(windowId) {
  const tab = await chrome.tabs.create({ windowId, active: true });
  const placeholders = await read();
  placeholders[tab.id] = { windowId };
  await chrome.storage.session.set({ [KEY]: placeholders });
  return tab;
}

async function findPlaceholder(windowId, excludedId) {
  const placeholders = await read();
  for (const [id, owner] of Object.entries(placeholders)) {
    const tabId = Number(id);
    if (owner.windowId !== windowId || tabId === excludedId) continue;
    let tab;
    try { tab = await chrome.tabs.get(tabId); } catch {}
    if (tab?.windowId === windowId && !tab.pinned && (tab.groupId == null || tab.groupId === -1) && isNewTab(tab.url) && isNewTab(tab.pendingUrl)) return tab;
    await forget(tabId);
  }
  return null;
}

export async function reuseWindowPlaceholder(windowId, url) {
  const placeholder = await findPlaceholder(windowId);
  if (!placeholder) return null;
  // Do not release ownership until navigation succeeds. A failed open should
  // leave the blank tab available for another attempt.
  const tab = await chrome.tabs.update(placeholder.id, { url, active: true });
  await forget(placeholder.id);
  return tab;
}

export async function dismissWindowPlaceholder(tab) {
  try {
    for (;;) {
      const placeholder = await findPlaceholder(tab.windowId, tab.id);
      if (!placeholder) return;
      // The destination must still be in this window before removing its blank
      // companion. Never remove the last tab in a different source window.
      const tabs = await chrome.tabs.query({ windowId: tab.windowId });
      if (!tabs.some(current => current.id === tab.id && current.windowId === tab.windowId)) return;
      await chrome.tabs.remove(placeholder.id);
      await forget(placeholder.id);
    }
  } catch {} // Failing cosmetic cleanup must not fail a successful activation.
}

const release = tabId => serializeState(() => forget(tabId)).catch(console.warn);
chrome.tabs.onRemoved.addListener(release);
chrome.tabs.onReplaced.addListener((_, removed) => release(removed));
chrome.tabs.onDetached?.addListener(release);
chrome.tabs.onUpdated.addListener((tabId, info) => {
  // Observe the navigation event itself: going back to New Tab later must not
  // turn a page the user has already used back into a disposable placeholder.
  if ((info.url != null && !isNewTab(info.url)) || info.pinned === true || (info.groupId != null && info.groupId >= 0)) release(tabId);
});
