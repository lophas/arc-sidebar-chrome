const OVERLAY_PING = 'arc-sidebar-overlay-ping';
const OVERLAY_FILE = 'src/overlay/overlay.js';

function isWebUrl(url) {
  return /^https?:\/\//i.test(url || '');
}

async function overlayIsPresent(tabId) {
  try {
    const response = await chrome.tabs.sendMessage(tabId, { type: OVERLAY_PING });
    return response?.present === true;
  } catch {
    return false;
  }
}

async function ensureOverlay(tab) {
  if (!tab?.id || !isWebUrl(tab.url || tab.pendingUrl)) return;
  if (await overlayIsPresent(tab.id)) return;

  try {
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
  // Chrome may restore an already-loaded document without rerunning declarative
  // content scripts. Probe each restored web tab and inject only when missing.
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
