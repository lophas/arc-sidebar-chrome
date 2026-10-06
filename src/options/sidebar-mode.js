const SIDEBAR_MODE_KEY = 'arcSidebarMode';
const OVERLAY_MODE = 'overlay';
const NATIVE_MODE = 'native';

const overlay = document.querySelector('#modeOverlay');
const native = document.querySelector('#modeNative');
const status = document.querySelector('#modeStatus');

function applySelection(mode) {
  const normalized = mode === NATIVE_MODE ? NATIVE_MODE : OVERLAY_MODE;
  overlay.checked = normalized === OVERLAY_MODE;
  native.checked = normalized === NATIVE_MODE;
}

async function loadMode() {
  const stored = await chrome.storage.local.get(SIDEBAR_MODE_KEY);
  applySelection(stored[SIDEBAR_MODE_KEY]);
}

async function saveMode(mode) {
  overlay.disabled = true;
  native.disabled = true;
  try {
    await chrome.storage.local.set({ [SIDEBAR_MODE_KEY]: mode });
    applySelection(mode);
    status.textContent = mode === NATIVE_MODE
      ? 'Native mode enabled · no edge trigger is active.'
      : 'Autohide overlay enabled.';
  } catch (error) {
    console.error(error);
    status.textContent = `Could not change sidebar mode: ${error.message}`;
    await loadMode();
  } finally {
    overlay.disabled = false;
    native.disabled = false;
  }
}

overlay.addEventListener('change', () => {
  if (overlay.checked) saveMode(OVERLAY_MODE);
});

native.addEventListener('change', () => {
  if (native.checked) saveMode(NATIVE_MODE);
});

chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'local' && changes[SIDEBAR_MODE_KEY]) {
    applySelection(changes[SIDEBAR_MODE_KEY].newValue);
  }
});

await loadMode();
