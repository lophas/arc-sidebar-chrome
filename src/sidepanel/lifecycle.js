const overlay = new URLSearchParams(location.search).get('overlay') === '1';
let requested = !overlay;
let active = requested && document.visibilityState !== 'hidden';
export const isSidebarActive = () => active;
export const isOverlaySidebar = () => overlay;
function update() {
  const next = requested && document.visibilityState !== 'hidden';
  if (next === active) return;
  active = next;
  window.dispatchEvent(new CustomEvent('arc-sidebar-activity', { detail: { active } }));
}
window.addEventListener('message', event => {
  if (!overlay || event.source !== window.parent || event.data?.type !== 'arc-sidebar-overlay-visibility') return;
  requested = event.data.open === true;
  update();
});
document.addEventListener('visibilitychange', update);
window.addEventListener('pagehide', () => { if (active) { active = false; window.dispatchEvent(new CustomEvent('arc-sidebar-activity', { detail: { active } })); } });
window.addEventListener('pageshow', update);
window.addEventListener('arc-sidebar-save-error', event => {
  let toast = document.querySelector('#sidebarSaveError');
  if (!toast) { toast = document.createElement('div'); toast.id = 'sidebarSaveError'; toast.setAttribute('role', 'alert'); toast.className = 'sidebar-save-error'; document.body.append(toast); }
  toast.textContent = event.detail.message;
});
