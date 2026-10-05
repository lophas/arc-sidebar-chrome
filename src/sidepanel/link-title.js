const TITLE_FETCH_TIMEOUT_MS = 6000;

function normalizeUrl(value) {
  const raw = value.trim();
  if (!raw) return '';
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(raw)) return raw;
  if (/^(chrome|edge|about):/i.test(raw)) return raw;
  return `https://${raw}`;
}

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

async function resolvePageTitle(url) {
  return (await titleFromOpenTab(url)) || (await titleFromPage(url));
}

document.addEventListener('click', async event => {
  const target = event.target;
  if (!(target instanceof Element)) return;

  const saveButton = target.closest('#itemSave');
  if (!(saveButton instanceof HTMLButtonElement)) return;

  if (saveButton.dataset.skipTitleFetch === '1') {
    delete saveButton.dataset.skipTitleFetch;
    return;
  }

  const dialog = saveButton.closest('dialog[open]');
  if (!dialog) return;

  const dialogTitle = dialog.querySelector('#itemDialogTitle')?.textContent?.toLowerCase() || '';
  if (!dialogTitle.includes('pinned link')) return;

  const titleInput = dialog.querySelector('#itemTitle');
  const urlInput = dialog.querySelector('#itemUrl');
  if (!(titleInput instanceof HTMLInputElement) || !(urlInput instanceof HTMLInputElement)) return;
  if (titleInput.value.trim()) return;

  const url = normalizeUrl(urlInput.value);
  if (!url) return;

  try {
    new URL(url);
  } catch {
    return;
  }

  event.preventDefault();
  event.stopImmediatePropagation();

  if (saveButton.dataset.fetchingTitle === '1') return;
  saveButton.dataset.fetchingTitle = '1';
  saveButton.setAttribute('aria-busy', 'true');
  const oldText = saveButton.textContent;
  saveButton.textContent = 'Fetching title…';

  const pageTitle = await resolvePageTitle(url);
  if (pageTitle) titleInput.value = pageTitle;

  delete saveButton.dataset.fetchingTitle;
  saveButton.removeAttribute('aria-busy');
  saveButton.textContent = oldText;
  saveButton.dataset.skipTitleFetch = '1';
  saveButton.click();
}, true);
