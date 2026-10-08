import { createStorageClient } from '../shared/storage-client.js';
const sidebarStorage = createStorageClient();
const MODE_KEY = 'arcSidebarMode';
const SIDE_KEY = 'arcSidebarEdgeSide';
const choices = ['left', 'right', 'native'].map(side => ({
  side, input: document.querySelector(side === 'native' ? '#modeNative' : side === 'left' ? '#modeLeft' : '#modeRight')
}));
const status = document.querySelector('#modeStatus');

async function loadSelection() {
  const stored = await sidebarStorage.local.get([MODE_KEY, SIDE_KEY]);
  const selection = stored[MODE_KEY] === 'native' ? 'native' : stored[SIDE_KEY] === 'right' ? 'right' : 'left';
  for (const {side, input} of choices) input.checked = side === selection;
}
for (const {side, input} of choices) {
  input.addEventListener('change', async () => {
    if (!input.checked) return;
    for (const choice of choices) choice.input.disabled = true;
    try {
      const values = { [MODE_KEY]: side === 'native' ? 'native' : 'overlay' };
      if (side !== 'native') values[SIDE_KEY] = side;
      await sidebarStorage.local.set(values);
      status.textContent = side === 'native' ? 'Fixed Chrome side panel selected.' : `Autohide ${side} selected.`;
    } catch (error) {
      status.textContent = `Could not change sidebar mode: ${error.message}`;
    } finally {
      await loadSelection();
      for (const choice of choices) choice.input.disabled = false;
    }
  });
}
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'local' && (changes[MODE_KEY] || changes[SIDE_KEY])) loadSelection().catch(console.error);
});
await loadSelection();
