import { sidebarTabAction } from './tab-actions.js';
const TYPE = 'application/x-arc-sidebar-workflow-tab';
const pinned = document.querySelector('#pinnedSection');
let drag = null;
const clearIndicators = () => document.querySelectorAll('.workflow-drop-before,.workflow-drop-after,.workflow-drop-into')
  .forEach(el => el.classList.remove('workflow-drop-before', 'workflow-drop-after', 'workflow-drop-into'));
function targetAt(event) {
  if (!pinned?.contains(event.target) || pinned.classList.contains('hidden')) return null;
  const row = event.target.closest('[data-saved-node-id]');
  if (row) return { element: row, targetNodeId: row.dataset.savedNodeId, after: event.clientY >= row.getBoundingClientRect().top + row.getBoundingClientRect().height / 2 };
  const header = event.target.closest('.folder-header[data-folder-node-id]');
  if (header) {
    const rect = header.getBoundingClientRect(), fraction = (event.clientY - rect.top) / rect.height;
    if (fraction <= .35 || fraction >= .65) return { element: header.parentElement, targetNodeId: header.dataset.folderNodeId, after: fraction >= .65 };
    return { element: header, folderId: header.dataset.folderNodeId };
  }
  const children = event.target.closest('.folder-children');
  if (children) return { element: children, folderId: children.parentElement.dataset.folderNodeId };
  return { element: pinned };
}
document.addEventListener('dragstart', event => {
  const row = event.target.closest?.('#openTabs [data-live-tab-id]');
  const spaceId = pinned?.dataset.spaceId;
  if (!row?.draggable || !spaceId || !event.dataTransfer) return;
  drag = { tabId: Number(row.dataset.liveTabId), spaceId };
  event.dataTransfer.effectAllowed = 'move';
  event.dataTransfer.setData(TYPE, JSON.stringify(drag));
  row.classList.add('workflow-dragging');
});
document.addEventListener('dragover', event => {
  if (!event.dataTransfer?.types.includes(TYPE) || !drag || drag.spaceId !== pinned?.dataset.spaceId) return;
  clearIndicators();
  const target = targetAt(event); if (!target) return;
  event.preventDefault(); event.stopImmediatePropagation();
  event.dataTransfer.dropEffect = 'move';
  target.element.classList.add(target.targetNodeId ? target.after ? 'workflow-drop-after' : 'workflow-drop-before' : 'workflow-drop-into');
}, true);
document.addEventListener('drop', event => {
  if (!event.dataTransfer?.types.includes(TYPE)) return;
  const target = targetAt(event); if (!target) return;
  event.preventDefault(); event.stopImmediatePropagation();
  clearIndicators();
  let source;
  try { source = JSON.parse(event.dataTransfer.getData(TYPE)); } catch { return; }
  if (!drag || source.tabId !== drag.tabId || source.spaceId !== pinned.dataset.spaceId || source.spaceId !== drag.spaceId) return;
  const { element, ...position } = target;
  sidebarTabAction('pin-workflow-tab', { ...source, ...position }).catch(() => {});
  drag = null;
}, true);
document.addEventListener('dragleave', event => {
  if (pinned?.contains(event.target) && !pinned.contains(event.relatedTarget)) clearIndicators();
});
document.addEventListener('dragend', () => {
  drag = null; clearIndicators();
  document.querySelectorAll('.workflow-dragging').forEach(row => row.classList.remove('workflow-dragging'));
});
