const FAVORITES = { id: '__favorites__', title: 'Favorites' };

export async function syncNativeGroupVisibility(windowId) {
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
      if (current.collapsed !== collapsed) await chrome.tabGroups.update(group.id, { collapsed });
    } catch (error) {
      // A tab/group can disappear while its window is closing.
      console.warn('Arc Sidebar: group visibility update skipped', error);
    }
  }
}

let timer = null;
let running = false;
const pendingWindows = new Set();

async function flushVisibility() {
  timer = null;
  if (running) return;
  running = true;
  const windows = [...pendingWindows];
  pendingWindows.clear();
  try {
    for (const windowId of windows) await syncNativeGroupVisibility(windowId);
  } catch (error) {
    console.warn('Arc Sidebar: group visibility failed', error);
  } finally {
    running = false;
    if (pendingWindows.size && !timer) timer = setTimeout(flushVisibility, 60);
  }
}

export function queueNativeGroupVisibility(windowId) {
  if (!Number.isInteger(windowId) || windowId < 0) return;
  pendingWindows.add(windowId);
  if (!running && !timer) timer = setTimeout(flushVisibility, 60);
}

export function watchNativeGroupVisibility() {
  // Manual group changes stay in place until focus changes. Limit the update
  // to that window so working elsewhere preserves its manual layout too.
  chrome.tabs.onActivated.addListener(({ windowId }) => queueNativeGroupVisibility(windowId));
  chrome.windows.onFocusChanged.addListener(queueNativeGroupVisibility);
}
