const OVERLAY_FILE = 'src/overlay/overlay.js';

function isWebUrl(url) {
  return /^https?:\/\//i.test(url || '');
}

async function ensureOverlay(tab) {
  if (!tab?.id || !isWebUrl(tab.url || tab.pendingUrl)) return;

  try {
    // Safe to call even when the declarative content script already ran:
    // overlay.js has its own isolated-world singleton guard and exits at once.
    await chrome.scripting.executeScript({
      target: { tabId: tab.id, frameIds: [0] },
      files: [OVERLAY_FILE]
    });
  } catch (error) {
    // Protected pages, discarded/unavailable tabs and tabs changing document
    // during startup can legitimately reject injection. A later activation or
    // completed navigation gets another chance.
    if (!String(error?.message || error).includes('Cannot access')) {
      console.debug('Arc Sidebar: overlay restore skipped', tab.id, error?.message || error);
    }
  }
}

async function ensureAllOverlays() {
  const tabs = await chrome.tabs.query({});
  await Promise.allSettled(tabs.map(ensureOverlay));
}

chrome.runtime.onStartup.addListener(() => {
  // Restored documents can survive Chrome startup without the declarative
  // content script being attached again. Re-run overlay.js on web tabs; its
  // singleton guard makes this idempotent on tabs where it is already present.
  setTimeout(() => {
    ensureAllOverlays().catch(error => {
      console.warn('Arc Sidebar: startup overlay restore failed', error);
    });
  }, 700);
});

chrome.runtime.onInstalled.addListener(() => {
  ensureAllOverlays().catch(() => {});
});

chrome.tabs.onActivated.addListener(async ({ tabId }) => {
  try {
    const tab = await chrome.tabs.get(tabId);
    await ensureOverlay(tab);
  } catch {}
});

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status !== 'complete') return;
  ensureOverlay(tab).catch(() => {});
});
