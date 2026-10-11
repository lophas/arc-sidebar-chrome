export function autoPipSite(tab) {
  try {
    const url = new URL(tab?.pendingUrl || tab?.url || '');
    if (url.protocol !== 'https:') return null;
    return {
      host: url.host,
      settingsUrl: `chrome://settings/content/siteDetails?site=${encodeURIComponent(url.origin)}`
    };
  } catch { return null; }
}

export async function openAutoPipSiteSettings(windowId, browser = chrome) {
  // Resolve the source at click time: a sidebar can survive tab switches.
  const [tab] = await browser.tabs.query({ active: true, windowId });
  const site = autoPipSite(tab);
  if (!site) throw new Error('Open an HTTPS video page to enable its mini player.');
  await browser.tabs.create({ url: site.settingsUrl, windowId, index: tab.index + 1 });
}
