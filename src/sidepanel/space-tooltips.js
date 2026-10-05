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
  if (!label || !button.isConnected) return;

  const tip = ensureTooltip();
  tip.textContent = label;
  tip.hidden = false;

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
  hideTooltip();
  for (const button of spacesEl.querySelectorAll('.space-button')) decorateButton(button);
}

window.addEventListener('arc-sidebar-rendered', () => queueMicrotask(syncSpaceTooltips));
syncSpaceTooltips();
window.addEventListener('resize', hideTooltip);
window.addEventListener('scroll', hideTooltip, true);
