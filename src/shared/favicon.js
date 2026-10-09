export function faviconSource(pageUrl, faviconUrl = '') {
  // HTTP icons in extension pages trigger an HTTPS upgrade that breaks LAN sites.
  if (faviconUrl && !/^http:/i.test(faviconUrl)) return faviconUrl;
  return `chrome-extension://${chrome.runtime.id}/_favicon/?pageUrl=${encodeURIComponent(pageUrl || '')}&size=32`;
}

export function createFavicon({ url, faviconUrl, className = 'favicon', size, fallbackText = '●' }) {
  const image = document.createElement('img');
  image.className = className;
  image.alt = '';
  image.draggable = false;
  if (size) { image.width = size; image.height = size; }
  image.addEventListener('error', () => {
    const fallback = document.createElement('span');
    fallback.className = 'favicon-fallback';
    fallback.textContent = fallbackText;
    image.replaceWith(fallback);
  }, { once: true });
  image.src = faviconSource(url, faviconUrl);
  return image;
}
