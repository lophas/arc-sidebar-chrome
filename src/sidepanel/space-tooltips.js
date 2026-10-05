const spacesEl = document.querySelector('#spaces');

function syncSpaceTooltips() {
  if (!spacesEl) return;
  for (const button of spacesEl.querySelectorAll('.space-button')) {
    const label = button.dataset.label || button.getAttribute('aria-label') || '';
    if (label) button.title = label;
  }
}

const observer = new MutationObserver(() => queueMicrotask(syncSpaceTooltips));
if (spacesEl) {
  observer.observe(spacesEl, { childList: true, subtree: true });
  syncSpaceTooltips();
}
