const TITLE_FETCH_TIMEOUT_MS = 6000;

// Network access lives in the extension worker, including when the sidebar is
// embedded in a webpage. Return only the title's text, never a page's full HTML.
export async function fetchPageTitle(url, fetchPage = fetch) {
  let parsed;
  try { parsed = new URL(url); } catch { return { ok: false, error: 'Invalid URL' }; }
  if (!['http:', 'https:'].includes(parsed.protocol)) return { ok: false, error: 'Unsupported URL' };
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TITLE_FETCH_TIMEOUT_MS);
  try {
    const response = await fetchPage(parsed.href, { method: 'GET', redirect: 'follow', credentials: 'omit', cache: 'no-store', signal: controller.signal });
    if (!response.ok) return { ok: false, error: `HTTP ${response.status}` };
    const html = await response.text();
    const title = html.match(/<title\b[^>]*>([\s\S]*?)<\/title\s*>/i)?.[1];
    return title?.trim() ? { ok: true, title } : { ok: false, error: 'Page has no title' };
  } catch (error) {
    return { ok: false, error: error?.name === 'AbortError' ? 'Title lookup timed out' : error?.message || 'Title request failed' };
  } finally { clearTimeout(timer); }
}

chrome.runtime.onMessage.addListener((message, sender, respond) => {
  if (message?.type !== 'arc-sidebar-page-title') return;
  if (sender.id !== chrome.runtime.id || !sender.url?.startsWith(chrome.runtime.getURL('src/sidepanel/'))) {
    respond({ ok: false, error: 'Invalid title lookup sender' }); return;
  }
  fetchPageTitle(message.url).then(respond).catch(error => respond({ ok: false, error: error.message }));
  return true;
});
