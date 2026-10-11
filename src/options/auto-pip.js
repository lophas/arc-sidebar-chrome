import { createStorageClient } from '../shared/storage-client.js';
import { AUTO_PIP_SETTINGS_URL } from '../shared/auto-pip-settings.js';
const storage = createStorageClient();
const KEY = 'arcSidebarAutoPipEnabled';
const toggle = document.querySelector('#autoPipEnabled');
const status = document.querySelector('#autoPipStatus');
async function refresh() { toggle.checked = (await storage.local.get(KEY))[KEY] !== false; }
toggle.addEventListener('change', async () => {
  toggle.disabled = true;
  try {
    await storage.local.set({ [KEY]: toggle.checked });
    status.textContent = toggle.checked ? 'Automatic mini player is on.' : 'Automatic mini player is off.';
  } catch (error) { status.textContent = `Could not change mini player setting: ${error.message}`; }
  finally { toggle.disabled = false; await refresh(); }
});
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'local' && changes[KEY]) refresh().catch(console.error);
});
await refresh();
document.querySelector('#autoPipPermissions').addEventListener('click', async event => {
  event.preventDefault();
  try { await chrome.tabs.create({ url: AUTO_PIP_SETTINGS_URL }); }
  catch (error) { status.textContent = `Could not open PiP settings: ${error.message}`; }
});
