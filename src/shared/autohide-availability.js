export function canAutohideUrl(value) {
  try {
    const url = new URL(value);
    return ['http:', 'https:'].includes(url.protocol) &&
      url.hostname !== 'chromewebstore.google.com' &&
      !(url.hostname === 'chrome.google.com' && /^\/webstore(?:\/|$)/.test(url.pathname));
  } catch { return false; }
}
