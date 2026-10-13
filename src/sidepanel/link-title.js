const TITLE_FETCH_TIMEOUT_MS = 6000;

function comparableUrl(value) {
  try {
    const url = new URL(value);
    url.hash = '';
    return url.href.replace(/\/$/, '');
  } catch {
    return value || '';
  }
}

function cleanTitle(value) {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

async function titleFromOpenTab(url) {
  const wanted = comparableUrl(url);
  const tabs = await chrome.tabs.query({});
  const match = tabs.find(tab => comparableUrl(tab.url) === wanted && cleanTitle(tab.title));
  return cleanTitle(match?.title);
}

async function titleFromPage(url) {
  const parsed = new URL(url);
  if (!['http:', 'https:'].includes(parsed.protocol)) return '';

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TITLE_FETCH_TIMEOUT_MS);

  try {
    const response = await fetch(url, {
      method: 'GET',
      redirect: 'follow',
      credentials: 'omit',
      cache: 'no-store',
      signal: controller.signal
    });
    if (!response.ok) return '';

    const html = await response.text();
    const doc = new DOMParser().parseFromString(html, 'text/html');
    return cleanTitle(doc.querySelector('title')?.textContent);
  } catch {
    return '';
  } finally {
    clearTimeout(timer);
  }
}

export async function resolvePageTitle(url) {
  let openTitle = '';
  try { openTitle = await titleFromOpenTab(url); } catch {}
  return openTitle || (await titleFromPage(url));
}
