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
  try {
    const result = await chrome.runtime.sendMessage({ type: 'arc-sidebar-page-title', url: parsed.href });
    if (!result?.ok) {
      console.warn('Arc Side of the Chrome: page title lookup failed:', result?.error || 'No worker response');
      return '';
    }
    // Parse the worker's raw title text to decode HTML entities without loading
    // or executing the fetched page. Existing tabs still use their Chrome title.
    const doc = new DOMParser().parseFromString(`<title>${result.title}</title>`, 'text/html');
    return cleanTitle(doc.querySelector('title')?.textContent);
  } catch (error) {
    console.warn('Arc Side of the Chrome: page title lookup failed:', error.message);
    return '';
  }
}

export async function resolvePageTitle(url) {
  let openTitle = '';
  try { openTitle = await titleFromOpenTab(url); } catch {}
  return openTitle || (await titleFromPage(url));
}
