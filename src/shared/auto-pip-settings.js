export const AUTO_PIP_SETTINGS_URL = 'chrome://settings/content/autoPictureInPicture';

export function autoPipSite(tab) {
  try {
    const url = new URL(tab?.pendingUrl || tab?.url || '');
    if (url.protocol !== 'https:') return null;
    return {
      host: url.host,
      origin: url.origin,
      settingsUrl: AUTO_PIP_SETTINGS_URL
    };
  } catch { return null; }
}

export async function openAutoPipSiteSettings(tabId, browser = chrome) {
  // Use the content script's source tab, never an unrelated active tab/window.
  const tab = await browser.tabs.get(tabId);
  const site = autoPipSite(tab);
  if (!site) throw new Error('Open an HTTPS video page to enable its mini player.');
  await browser.tabs.create({ url: site.settingsUrl, windowId: tab.windowId, index: tab.index + 1 });
}
