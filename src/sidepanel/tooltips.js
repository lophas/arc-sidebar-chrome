const tooltip = document.createElement('div');
tooltip.className = 'sidebar-tooltip';
tooltip.role = 'tooltip';
tooltip.hidden = true;
document.body.append(tooltip);
let timer, target, savedTitle;
function hide() {
  clearTimeout(timer);
  tooltip.hidden = true;
  if (target && savedTitle != null) target.setAttribute('title', savedTitle);
  target = null;
}
function show(button) {
  hide();
  const text = button.getAttribute('title') || button.getAttribute('aria-label') || button.textContent.trim();
  if (!text) return;
  target = button;
  savedTitle = button.getAttribute('title');
  button.removeAttribute('title');
  timer = setTimeout(() => {
    if (!button.isConnected || document.visibilityState === 'hidden') return hide();
    tooltip.textContent = text;
    tooltip.hidden = false;
    const rect = button.getBoundingClientRect();
    const box = tooltip.getBoundingClientRect();
    tooltip.style.left = `${Math.max(6, Math.min(rect.left, innerWidth - box.width - 6))}px`;
    tooltip.style.top = `${rect.bottom + box.height + 12 < innerHeight ? rect.bottom + 6 : Math.max(6, rect.top - box.height - 6)}px`;
  }, 350);
}
document.addEventListener('pointerover', event => {
  const button = event.target.closest('button, [role="button"]');
  if (button && button !== target) show(button);
});
document.addEventListener('pointerout', event => {
  if (target && !target.contains(event.relatedTarget)) hide();
});
document.addEventListener('focusin', event => {
  if (event.target.matches('button, [role="button"]')) show(event.target);
});
for (const name of ['focusout', 'pointerdown', 'keydown', 'visibilitychange']) document.addEventListener(name, hide);
document.addEventListener('scroll', hide, true);
window.addEventListener('blur', hide);
