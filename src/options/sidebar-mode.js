import { createStorageClient } from '../shared/storage-client.js';
const sidebarStorage = createStorageClient();
const MODE_KEY = 'arcSidebarMode';
const TIMEOUT_KEY = 'arcSidebarAutohideTimeout';
import { sidebarPreferences, AUTOHIDE_TIMEOUTS } from '../shared/sidebar-preferences.js';
const allowed = new Set(AUTOHIDE_TIMEOUTS);
const select = document.querySelector('#autohideTimeout');
const status = document.querySelector('#modeStatus');
const warning = document.querySelector('#autohideWarning');
async function loadSelection() {
  const { mode, timeout } = sidebarPreferences(await sidebarStorage.local.get([TIMEOUT_KEY, MODE_KEY]));
  select.value = String(timeout);
  warning.hidden = mode === 'native';
}
select.addEventListener('change', async () => {
  const value = Number(select.value);
  if (!allowed.has(value)) return;
  select.disabled = true;
  try {
    const { mode } = sidebarPreferences(await sidebarStorage.local.get([TIMEOUT_KEY, MODE_KEY]));
    await sidebarStorage.local.set({ [TIMEOUT_KEY]: value, [MODE_KEY]: mode });
    status.textContent = `Autohide timeout: ${value} ms.`;
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
const previous = await sidebarStorage.local.get([TIMEOUT_KEY, MODE_KEY]);
if (previous[TIMEOUT_KEY] === 0) await sidebarStorage.local.set({ [TIMEOUT_KEY]: 800, [MODE_KEY]: 'native' });
await loadSelection();

const settingsLink = document.querySelector('#sidePanelSettings');
settingsLink.addEventListener('click', async event => {
  event.preventDefault();
  try {
    await chrome.tabs.create({ url: 'chrome://settings/appearance' });
  } catch (error) {
    status.textContent = `Could not open Chrome Settings: ${error.message}`;
  }
});
