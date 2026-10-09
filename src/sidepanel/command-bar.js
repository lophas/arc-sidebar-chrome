import { createFavicon } from '../shared/favicon.js';
import { isSidebarActive } from './lifecycle.js';
import { createStorageClient } from '../shared/storage-client.js';
const sidebarStorage = createStorageClient({ isActive: isSidebarActive });
import { buildResults } from './command-search.js';
const standalone = document.body.classList.contains('command-page');
const dialog = document.createElement('dialog');
dialog.className = 'command-dialog';
dialog.setAttribute('aria-label', 'Search or enter URL');
dialog.innerHTML = `<input class="command-input" aria-label="Search tabs, pinned links, folders, Spaces or enter URL" placeholder="Search or enter URL…" autocomplete="off" role="combobox" aria-expanded="true" aria-controls="commandResults" aria-autocomplete="list"><div id="commandResults" class="command-results" role="listbox"></div><div class="command-help">↑ ↓ Navigate · Enter Open · Esc Close</div><div class="command-error" role="alert"></div>`;
document.body.append(dialog);
const input = dialog.querySelector('input'), list = dialog.querySelector('.command-results'), error = dialog.querySelector('.command-error');
let data = [], results = [], selected = 0, generation = 0, busy = false, windowId;
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
async function refresh() {
  const token = ++generation;
  const [stored, tabs] = await Promise.all([sidebarStorage.local.get('arcSidebarModel'), chrome.tabs.query({})]);
  if (token !== generation) return;
  data = tabs.filter(tab => tab.id != null && /^(https?|file):\/\//i.test(tab.pendingUrl || tab.url || '')).map(tab => ({ kind: 'Open tab', favIconUrl: tab.favIconUrl, tabId: tab.id, lastAccessed: tab.lastAccessed || 0, title: tab.title || tab.url || 'Untitled tab', url: tab.url || '', detail: tab.url || '' }));
  const model = stored.arcSidebarModel;
  const walk = (nodes, space, ancestors = [], path = []) => {
    for (const node of nodes || []) {
      if (node.type === 'folder') {
        data.push({ kind: 'Folder', id: node.id, spaceId: space.id, ancestors, title: node.title || 'Untitled folder', detail: [space.title, ...path].join(' / ') });
        walk(node.children, space, [...ancestors, node.id], [...path, node.title]);
      } else if (node.type === 'tab' && node.url) data.push({ ...node, kind: space.id ? 'Pinned' : 'Favorite', spaceId: space.id, ancestors, title: node.title || node.url, detail: [space.title, ...path, node.url].join(' / ') });
    }
  };
  walk(model?.favorites, { title: 'Favorites' });
  for (const space of model?.spaces || []) { data.push({ kind: 'Space', spaceId: space.id, title: space.title || 'Untitled Space' }); walk(space.children, space); }
  render();
}
async function open() {
  if (dialog.open) { input.focus(); return; }
  windowId = standalone ? Number(new URLSearchParams(location.search).get('windowId')) : (await chrome.windows.getCurrent()).id;
  input.value = ''; selected = 0; error.textContent = ''; dialog.showModal(); input.focus();
  refresh().catch(e => { error.textContent = e.message; });
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
  if (event.key === 'Enter') { event.preventDefault(); execute(results[selected]); }
});
dialog.addEventListener('close', () => { if (standalone) window.close(); });
dialog.addEventListener('click', event => { if (event.target === dialog) { const r = dialog.getBoundingClientRect(); if (event.clientX < r.left || event.clientX > r.right || event.clientY < r.top || event.clientY > r.bottom) dialog.close(); } });
document.querySelector('#openCommandBar')?.addEventListener('click', open);
document.addEventListener('keydown', event => { if ((event.metaKey || event.ctrlKey) && !event.altKey && !event.shiftKey && event.code === 'KeyK') { event.preventDefault(); open(); } });
chrome.storage.onChanged.addListener(changes => { if (dialog.open && changes.arcSidebarModel) refresh().catch(e => { error.textContent = e.message; }); });
for (const event of [chrome.tabs.onCreated, chrome.tabs.onRemoved, chrome.tabs.onUpdated, chrome.tabs.onActivated]) event.addListener(() => { if (dialog.open) refresh().catch(() => {}); });
if (standalone) open();
