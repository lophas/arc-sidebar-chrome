import { isSidebarActive } from './lifecycle.js';
const scroller = document.querySelector('main');
let dragging = false, pointer = null, frame = null, lastTime = null;

function stopScrolling() {
  if (frame != null) cancelAnimationFrame(frame);
  frame = null;
  lastTime = null;
}
function finishDrag() {
  dragging = false;
  pointer = null;
  stopScrolling();
}
function velocity() {
  if (!scroller || !pointer || !dragging || !isSidebarActive()) return 0;
  const rect = scroller.getBoundingClientRect();
  if (pointer.x < rect.left || pointer.x > rect.right || pointer.y < rect.top || pointer.y > rect.bottom) return 0;
  const edge = Math.min(56, rect.height / 3);
  if (pointer.y < rect.top + edge) return -700 * (1 - (pointer.y - rect.top) / edge);
  if (pointer.y > rect.bottom - edge) return 700 * (1 - (rect.bottom - pointer.y) / edge);
  return 0;
}
function scrollFrame(time) {
  frame = null;
  const speed = velocity();
  if (!speed) { lastTime = null; return; }
  const elapsed = lastTime == null ? 16 : Math.min(32, time - lastTime);
  lastTime = time;
  const before = scroller.scrollTop;
  scroller.scrollTop += speed * elapsed / 1000;
  if (scroller.scrollTop !== before) frame = requestAnimationFrame(scrollFrame);
  else lastTime = null;
}
// Install before the drop handlers: capture listeners still see the pointer
// when another drag handler consumes the event for its own insertion target.
document.addEventListener('dragstart', event => {
  const source = event.target.closest?.('.favorite-tile, [data-saved-node-id], [data-live-tab-id], .folder-header');
  if (!source?.draggable || !isSidebarActive()) return;
  dragging = true;
}, true);
document.addEventListener('dragover', event => {
  if (!dragging) return;
  pointer = { x: event.clientX, y: event.clientY };
  if (velocity()) {
    if (frame == null) frame = requestAnimationFrame(scrollFrame);
  } else stopScrolling();
}, true);
document.addEventListener('dragleave', event => {
  if (!event.relatedTarget && event.target === document.documentElement) { pointer = null; stopScrolling(); }
}, true);
document.addEventListener('drop', finishDrag, true);
document.addEventListener('dragend', finishDrag, true);
window.addEventListener('pagehide', finishDrag);
window.addEventListener('arc-sidebar-activity', event => { if (!event.detail.active) finishDrag(); });
