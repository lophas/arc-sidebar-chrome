const spacesEl = document.querySelector('#spaces');

let tooltip = null;
let hideTimer = null;

function ensureTooltip() {
  if (tooltip) return tooltip;
  tooltip = document.createElement('div');
  tooltip.className = 'space-hover-tooltip';
  tooltip.setAttribute('role', 'tooltip');
  tooltip.hidden = true;
  document.body.append(tooltip);
  return tooltip;
}

function labelFor(button) {
  return button.dataset.label || button.getAttribute('aria-label') || '';
}

function hideTooltip() {
  if (hideTimer) {
    clearTimeout(hideTimer);
    hideTimer = null;
  }
  if (tooltip) tooltip.hidden = true;
}

function showTooltip(button) {
  const label = labelFor(button);
  if (!label) return;

  const tip = ensureTooltip();
  tip.textContent = label;
  tip.hidden = false;

  // Measure after making it visible, then position above the hovered Space icon.
  const rect = button.getBoundingClientRect();
  const tipRect = tip.getBoundingClientRect();
  const margin = 8;

  let left = rect.left + rect.width / 2 - tipRect.width / 2;
  left = Math.max(margin, Math.min(left, window.innerWidth - tipRect.width - margin));

  let top = rect.top - tipRect.height - 8;
  if (top < margin) top = rect.bottom + 8;

  tip.style.left = `${Math.round(left)}px`;
  tip.style.top = `${Math.round(top)}px`;
}

function decorateButton(button) {
  if (button.dataset.customTooltipManaged === '1') return;
  button.dataset.customTooltipManaged = '1';

  // Avoid relying on Chromium's native title tooltip inside the Side Panel.
  button.removeAttribute('title');

  button.addEventListener('mouseenter', () => {
    if (hideTimer) clearTimeout(hideTimer);
    hideTimer = setTimeout(() => showTooltip(button), 250);
  });
  button.addEventListener('mouseleave', hideTooltip);
  button.addEventListener('mousedown', hideTooltip);
  button.addEventListener('click', hideTooltip);
  button.addEventListener('dragstart', hideTooltip);
  button.addEventListener('focus', () => showTooltip(button));
  button.addEventListener('blur', hideTooltip);
}

function syncSpaceTooltips() {
  if (!spacesEl) return;
  for (const button of spacesEl.querySelectorAll('.space-button')) {
    decorateButton(button);
  }
}

const observer = new MutationObserver(() => queueMicrotask(syncSpaceTooltips));
if (spacesEl) {
  observer.observe(spacesEl, { childList: true, subtree: true });
  syncSpaceTooltips();
}

window.addEventListener('resize', hideTooltip);
window.addEventListener('scroll', hideTooltip, true);
