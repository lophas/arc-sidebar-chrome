import { createStorageClient } from '../shared/storage-client.js';
const sidebarStorage = createStorageClient();
const MODE_KEY = 'arcSidebarMode';
const TIMEOUT_KEY = 'arcSidebarAutohideTimeout';
const allowed = new Set([0, 500, 600, 700, 800, 900, 1000, 1100]);
const select = document.querySelector('#autohideTimeout');
const status = document.querySelector('#modeStatus');
const warning = document.querySelector('#autohideWarning');
function timeout(stored) {
  const value = stored[TIMEOUT_KEY];
  return allowed.has(value) ? value : stored[MODE_KEY] === 'native' ? 0 : 800;
}
async function loadSelection() {
  const value = timeout(await sidebarStorage.local.get([TIMEOUT_KEY, MODE_KEY]));
  select.value = String(value);
  warning.hidden = value === 0;
}
select.addEventListener('change', async () => {
  const value = Number(select.value);
  if (!allowed.has(value)) return;
  select.disabled = true;
  try {
    await sidebarStorage.local.set({ [TIMEOUT_KEY]: value, [MODE_KEY]: value === 0 ? 'native' : 'overlay' });
    status.textContent = value === 0 ? 'Autohide disabled · open the fixed side panel with the extension button.' : `Autohide timeout: ${value} ms.`;
  } catch (error) {
    status.textContent = `Could not change autohide timeout: ${error.message}`;
  } finally {
    select.disabled = false;
    await loadSelection();
  }
});
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'local' && (changes[MODE_KEY] || changes[TIMEOUT_KEY])) loadSelection().catch(console.error);
});
await loadSelection();
