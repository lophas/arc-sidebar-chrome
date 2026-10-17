import { sidebarPreferences } from '../shared/sidebar-preferences.js';
const button = document.querySelector('#toggleSidebarMode');
let mode = 'overlay';
const { id: windowId } = await chrome.windows.getCurrent();
async function refresh() {
  ({ mode } = sidebarPreferences(await chrome.storage.local.get(['arcSidebarMode', 'arcSidebarAutohideTimeout'])));
  button.title = mode === 'native' ? 'Fixed sidebar · switch to Autohide' : 'Autohide sidebar · switch to Fixed';
  button.setAttribute('aria-label', button.title);
  button.setAttribute('aria-pressed', String(mode === 'native'));
  button.textContent = mode === 'native' ? '▣' : '◧';
}
button.addEventListener('click', async () => {
  button.disabled = true;
  try {
    const targetMode = mode === 'native' ? 'overlay' : 'native';
    const response = await chrome.runtime.sendMessage({ type: 'arc-sidebar-switch-mode', windowId, mode: targetMode });
    if (!response?.ok) throw new Error(response?.error || 'Could not switch sidebar mode.');
    // Complete the handoff with our own host, even if background tab delivery
    // missed it while Chrome resized/focused the newly opened native panel.
    if (targetMode === 'native' && window.parent !== window) {
      window.parent.postMessage({ type: 'arc-sidebar-fixed-handoff' }, '*');
    }
    await refresh();
  } catch (error) {
    button.title = error.message;
  } finally { button.disabled = false; }
});
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'local' && (changes.arcSidebarMode || changes.arcSidebarAutohideTimeout)) refresh().catch(console.error);
});
await refresh();
