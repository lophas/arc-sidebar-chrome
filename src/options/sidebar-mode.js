import { createStorageClient } from '../shared/storage-client.js';
const sidebarStorage = createStorageClient();
const MODE_KEY = 'arcSidebarMode';
const choices = ['overlay', 'native'].map(side => ({
  side, input: document.querySelector(side === 'native' ? '#modeNative' : '#modeOverlay')
}));
const status = document.querySelector('#modeStatus');

async function loadSelection() {
  const stored = await sidebarStorage.local.get(MODE_KEY);
  const selection = stored[MODE_KEY] === 'native' ? 'native' : 'overlay';
  for (const {side, input} of choices) input.checked = side === selection;
}
for (const {side, input} of choices) {
  input.addEventListener('change', async () => {
    if (!input.checked) return;
    for (const choice of choices) choice.input.disabled = true;
    try {
      const values = { [MODE_KEY]: side === 'native' ? 'native' : 'overlay' };
      await sidebarStorage.local.set(values);
      status.textContent = side === 'native' ? 'Fixed Chrome side panel selected.' : 'Autohide selected.';
    } catch (error) {
      status.textContent = `Could not change sidebar mode: ${error.message}`;
    } finally {
      await loadSelection();
      for (const choice of choices) choice.input.disabled = false;
    }
  });
}
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'local' && changes[MODE_KEY]) loadSelection().catch(console.error);
});
await loadSelection();
