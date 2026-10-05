const STORAGE_KEY = 'arcSidebarModel';
const STATE_KEY = 'arcSidebarState';
const OPEN_TABS_SPACE_ID = '__open_tabs__';

const spacesEl = document.querySelector('#spaces');

function findNodeLocation(nodes, id) {
  for (let index = 0; index < (nodes || []).length; index += 1) {
    const node = nodes[index];
    if (node.id === id) return { node, parent: nodes, index };
    if (node.type === 'folder') {
      const found = findNodeLocation(node.children || [], id);
      if (found) return found;
    }
  }
  return null;
}

function findSourceSpace(model, itemId) {
  for (const space of model.spaces || []) {
    const location = findNodeLocation(space.children || [], itemId);
    if (location) return { space, location };
  }
  return null;
}

async function movePinnedToSpace(itemId, targetSpaceId) {
  if (!itemId || !targetSpaceId || targetSpaceId === OPEN_TABS_SPACE_ID) return;

  const stored = await chrome.storage.local.get([STORAGE_KEY, STATE_KEY]);
  const model = stored[STORAGE_KEY];
  if (!model?.spaces?.length) return;

  const source = findSourceSpace(model, itemId);
  const targetSpace = model.spaces.find(space => space.id === targetSpaceId);
  if (!source || !targetSpace || source.location.node.type !== 'tab') return;

  // Space icons are only for cross-Space moves. Reordering within the current
  // Space remains handled by the link-to-link drop targets in manage.js.
  if (source.space.id === targetSpace.id) return;

  const [moved] = source.location.parent.splice(source.location.index, 1);
  if (!moved) return;

  targetSpace.children ||= [];
  targetSpace.children.push(moved);

  const state = {
    currentSpaceId: targetSpace.id,
    collapsedFolders: {},
    ...(stored[STATE_KEY] || {})
  };
  state.currentSpaceId = targetSpace.id;

  await chrome.storage.local.set({
    [STORAGE_KEY]: model,
    [STATE_KEY]: state
  });
}

async function decorateSpaceDropTargets() {
  if (!spacesEl) return;

  const stored = await chrome.storage.local.get(STORAGE_KEY);
  const model = stored[STORAGE_KEY];
  if (!model?.spaces?.length) return;

  const buttons = [...spacesEl.querySelectorAll('.space-button')];

  model.spaces.forEach((space, index) => {
    const button = buttons[index];
    if (!button) return;

    // renderSpaces() recreates these buttons, so decorate every new instance once.
    if (button.dataset.spaceDropManaged === '1') return;
    button.dataset.spaceDropManaged = '1';
    button.dataset.spaceDropId = space.id;

    button.addEventListener('dragenter', event => {
      if (!event.dataTransfer?.types?.includes('text/plain')) return;
      event.preventDefault();
      button.classList.add('space-drop-target');
    });

    button.addEventListener('dragover', event => {
      if (!event.dataTransfer?.types?.includes('text/plain')) return;
      event.preventDefault();
      event.dataTransfer.dropEffect = 'move';
      button.classList.add('space-drop-target');
    });

    button.addEventListener('dragleave', event => {
      if (!button.contains(event.relatedTarget)) {
        button.classList.remove('space-drop-target');
      }
    });

    button.addEventListener('drop', async event => {
      event.preventDefault();
      event.stopPropagation();
      button.classList.remove('space-drop-target');
      const itemId = event.dataTransfer.getData('text/plain');
      await movePinnedToSpace(itemId, space.id);
    });
  });
}

const observer = new MutationObserver(() => queueMicrotask(decorateSpaceDropTargets));
if (spacesEl) {
  observer.observe(spacesEl, { childList: true });
  decorateSpaceDropTargets();
}
