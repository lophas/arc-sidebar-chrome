import { getSearchShortcut, isDefaultSearchShortcut } from '../shared/search-shortcut.js';
import { createFavicon } from '../shared/favicon.js';
import { isSidebarActive } from './lifecycle.js';
import { createStorageClient } from '../shared/storage-client.js';
const sidebarStorage = createStorageClient({ isActive: isSidebarActive });
import { buildResults, buildSearchData } from './command-search.js';
const standalone = document.body.classList.contains('command-page');
const dialog = document.createElement('dialog');
dialog.className = 'command-dialog';
dialog.setAttribute('aria-label', 'Search or enter URL');
dialog.innerHTML = `<input class="command-input" aria-label="Search tabs, pinned links, folders, Spaces or enter URL" placeholder="Search or enter URL…" autocomplete="off" role="combobox" aria-expanded="true" aria-controls="commandResults" aria-autocomplete="list"><div id="commandResults" class="command-results" role="listbox"></div><div class="command-help">↑ ↓ Navigate · Enter Open · Esc Close</div><div class="command-error" role="alert"></div>`;
document.body.append(dialog);
const input = dialog.querySelector('input'), list = dialog.querySelector('.command-results'), error = dialog.querySelector('.command-error');
let data = [], results = [], selected = 0, generation = 0, busy = false, windowId, openContext, pendingRefresh;
function render() {
  results = buildResults(data, input.value); selected = Math.min(selected, Math.max(0, results.length - 1));
  list.replaceChildren();
  results.forEach((item, index) => {
    const row = document.createElement('div'); row.id = `command-result-${index}`; row.className = 'command-result'; row.setAttribute('role', 'option'); row.setAttribute('aria-selected', String(index === selected));
    const text = document.createElement('div'), title = document.createElement('strong'), detail = document.createElement('small'), kind = document.createElement('span');
    title.textContent = item.title; detail.textContent = item.detail || item.url || ''; kind.textContent = item.kind;
    const icon = document.createElement('span'); icon.className = 'command-icon'; icon.setAttribute('aria-hidden', 'true');
    icon.textContent = item.kind === 'Folder' ? '▱' : item.kind === 'Space' ? '◉' : item.kind === 'Search' ? '⌕' : '🌐';
    if (item.url && item.kind !== 'Search') {
      icon.replaceChildren(createFavicon({ url: item.url, faviconUrl: item.favIconUrl, className: '', size: 20, fallbackText: '🌐' }));
    }
    text.append(title, detail); row.append(icon, text, kind); row.addEventListener('click', () => execute(item)); list.append(row);
  });
  input.setAttribute('aria-activedescendant', results.length ? `command-result-${selected}` : '');
  list.children[selected]?.scrollIntoView({ block: 'nearest' });
}
function refresh() {
  const token = ++generation, context = openContext;
  const task = (async () => {
    const source = await context;
    if (token !== generation || !dialog.open) return;
    const [stored, session, tabs, groups] = await Promise.all([
      sidebarStorage.local.get('arcSidebarModel'), sidebarStorage.session.get('arcSidebarBindings'),
      chrome.tabs.query({}), chrome.tabGroups.query({})
    ]);
    if (token !== generation || !dialog.open) return;
    windowId = source.windowId;
    data = buildSearchData({ model: stored.arcSidebarModel, bindings: session.arcSidebarBindings,
      tabs, groups, ...source });
    render();
  })().catch(e => { if (token === generation && dialog.open) error.textContent = e.message; });
  pendingRefresh = task;
  task.finally(() => { if (pendingRefresh === task) pendingRefresh = null; });
  return task;
}
function open() {
  if (dialog.open) { input.focus(); return; }
  // Freeze the source before the popup steals focus; exclude it only from the
  // recent list, so the first result is the previously used tab.
  openContext = standalone ? Promise.resolve({
    windowId: Number(new URLSearchParams(location.search).get('windowId')),
    sourceTabId: Number(new URLSearchParams(location.search).get('sourceTabId'))
  }) : (async () => {
    const source = await chrome.windows.getCurrent();
    const [tab] = await chrome.tabs.query({ active: true, windowId: source.id });
    return { windowId: source.id, sourceTabId: tab?.id };
  })();
  input.value = ''; selected = 0; error.textContent = ''; data = []; render();
  dialog.showModal(); input.focus();
  refresh();
}
async function executeSelected() {
  // A quick Alt+K → Enter must wait for this opening's data, never use stale
  // results from the last time the shared search dialog was opened.
  const context = openContext;
  while (pendingRefresh && dialog.open && openContext === context) await pendingRefresh;
  if (dialog.open && openContext === context) execute(results[selected]);
}
async function execute(item) {
  if (busy || !item) return;
  busy = true; error.textContent = '';
  try {
    // Call directly within the click/key gesture before awaiting storage work.
    if (standalone && ['Space', 'Folder'].includes(item.kind)) await chrome.sidePanel.open({ windowId });
    const response = await chrome.runtime.sendMessage({ type: 'arc-command-execute', item, windowId });
    if (!response?.ok) throw new Error(response?.error || 'Could not open result');
    dialog.close();
  } catch (e) { error.textContent = e.message; } finally { busy = false; }
}
input.addEventListener('input', () => { selected = 0; render(); });
input.addEventListener('keydown', event => {
  if (event.isComposing) return;
  if (['ArrowDown', 'ArrowUp'].includes(event.key)) { event.preventDefault(); selected = results.length ? (selected + (event.key === 'ArrowDown' ? 1 : -1) + results.length) % results.length : 0; render(); }
  if (event.key === 'Enter') { event.preventDefault(); executeSelected(); }
});
dialog.addEventListener('close', () => {
  // Chrome queues this event: the same dialog may already have reopened by
  // the time an older close is delivered. Keep the new search request alive.
  if (dialog.open) return;
  generation++; pendingRefresh = null;
  if (standalone) window.close();
});
dialog.addEventListener('click', event => { if (event.target === dialog) { const r = dialog.getBoundingClientRect(); if (event.clientX < r.left || event.clientX > r.right || event.clientY < r.top || event.clientY > r.bottom) dialog.close(); } });
const launcher = document.querySelector('#openCommandBar');
launcher?.addEventListener('click', open);
let shortcut = '';
async function refreshShortcut() {
  shortcut = await getSearchShortcut();
  if (!launcher) return;
  const hint = launcher.querySelector('span');
  if (hint) hint.textContent = shortcut || 'Set shortcut';
  launcher.title = shortcut ? `Search open tabs or enter a URL · ${shortcut}`
    : 'Search open tabs or enter a URL · No shortcut assigned. Set one at chrome://extensions/shortcuts';
}
refreshShortcut();
window.addEventListener('focus', refreshShortcut);
// Custom bindings are handled by Chrome. This local fallback applies only to
// the registered default, including Option+K's non-letter key on macOS.
document.addEventListener('keydown', event => {
  if (isDefaultSearchShortcut(event, shortcut)) { event.preventDefault(); open(); }
});
chrome.storage.onChanged.addListener(changes => { if (dialog.open && (changes.arcSidebarModel || changes.arcSidebarBindings)) refresh(); });
for (const event of [chrome.tabs.onCreated, chrome.tabs.onRemoved, chrome.tabs.onUpdated, chrome.tabs.onActivated]) event.addListener(() => { if (dialog.open) refresh(); });
for (const event of [chrome.tabGroups.onCreated, chrome.tabGroups.onRemoved, chrome.tabGroups.onUpdated]) event?.addListener(() => { if (dialog.open) refresh(); });
if (standalone) open();
