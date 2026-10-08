const FAVORITES = { id: '__favorites__', title: 'Favorites' };

export async function syncNativeGroupVisibility(windowId, canContinue = () => true) {
  const [local, session, groups] = await Promise.all([
    chrome.storage.local.get('arcSidebarModel'),
    chrome.storage.session.get('arcSidebarNativeGroups'),
    chrome.tabGroups.query({})
  ]);
  const spaces = new Map([FAVORITES, ...(local.arcSidebarModel?.spaces || [])].map(space => [space.id, space]));
  const map = session.arcSidebarNativeGroups || {};
  const managed = groups.filter(group => (windowId == null || group.windowId === windowId) && [...spaces].some(([id, space]) =>
    map[`${group.windowId}:${id}`] === group.id && space.title === group.title));
  // Expand the visible group first, then collapse the rest. Re-read the active
  // tab before each update so a rapid tab switch does not use an old snapshot.
  const active = await chrome.tabs.query({ active: true, ...(windowId == null ? {} : { windowId }) });
  const activeGroups = new Set(active.map(tab => tab.groupId));
  managed.sort((a, b) => Number(activeGroups.has(b.id)) - Number(activeGroups.has(a.id)));
  for (const group of managed) {
    try {
      const [current, tabs] = await Promise.all([
        chrome.tabGroups.get(group.id),
        chrome.tabs.query({ active: true, windowId: group.windowId })
      ]);
      if (current.windowId !== group.windowId || current.title !== group.title || !tabs.length) continue;
      const collapsed = tabs[0].groupId !== group.id;
      if (!canContinue()) return;
      if (current.collapsed !== collapsed) await chrome.tabGroups.update(group.id, { collapsed });
    } catch (error) {
      // A tab/group can disappear while its window is closing.
      console.warn('Arc Sidebar: group visibility update skipped', error);
    }
  }
}

let timer = null;
let running = false;
let groupingHolds = 0;
const pendingWindows = new Set();

async function flushVisibility() {
  timer = null;
  if (running || groupingHolds) return;
  running = true;
  const windows = [...pendingWindows];
  pendingWindows.clear();
  try {
    for (const windowId of windows) {
      await syncNativeGroupVisibility(windowId, () => groupingHolds === 0);
      if (groupingHolds) pendingWindows.add(windowId);
    }
  } catch (error) {
    console.warn('Arc Sidebar: group visibility failed', error);
  } finally {
    running = false;
    if (pendingWindows.size && !timer && !groupingHolds) timer = setTimeout(flushVisibility, 60);
  }
}

export function queueNativeGroupVisibility(windowId) {
  if (!Number.isInteger(windowId) || windowId < 0) return;
  pendingWindows.add(windowId);
  if (!running && !timer && !groupingHolds) timer = setTimeout(flushVisibility, 60);
}

export function watchNativeGroupVisibility() {
  // Manual group changes stay in place until focus changes. Limit the update
  // to that window so working elsewhere preserves its manual layout too.
  chrome.tabs.onActivated.addListener(({ windowId }) => queueNativeGroupVisibility(windowId));
  chrome.windows.onFocusChanged.addListener(queueNativeGroupVisibility);
}

// A newly focused tab may not belong to its destination group yet. Keep the
// original focus request pending until our grouping operation has settled.
// Grouping without a focus change never creates a visibility request.
export function holdNativeGroupVisibility() {
  groupingHolds += 1;
  let released = false;
  return () => {
    if (released) return;
    released = true;
    groupingHolds -= 1;
    if (!groupingHolds && pendingWindows.size && !running && !timer) {
      timer = setTimeout(flushVisibility, 60);
    }
  };
}
