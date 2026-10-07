const FAVORITES = { id: '__favorites__', title: 'Favorites' };

export async function syncNativeGroupVisibility() {
  const [local, session, groups] = await Promise.all([
    chrome.storage.local.get('arcSidebarModel'),
    chrome.storage.session.get('arcSidebarNativeGroups'),
    chrome.tabGroups.query({})
  ]);
  const spaces = new Map([FAVORITES, ...(local.arcSidebarModel?.spaces || [])].map(space => [space.id, space]));
  const map = session.arcSidebarNativeGroups || {};
  const managed = groups.filter(group => [...spaces].some(([id, space]) =>
    map[`${group.windowId}:${id}`] === group.id && space.title === group.title));
  // Expand the visible group first, then collapse the rest. Re-read the active
  // tab before each update so a rapid tab switch does not use an old snapshot.
  const active = await chrome.tabs.query({ active: true });
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
let pending = false;
export function queueNativeGroupVisibility() {
  if (running) { pending = true; return; }
  if (timer) clearTimeout(timer);
  timer = setTimeout(async () => {
    timer = null;
    running = true;
    try { await syncNativeGroupVisibility(); }
    catch (error) { console.warn('Arc Sidebar: group visibility failed', error); }
    finally {
      running = false;
      if (pending) { pending = false; queueNativeGroupVisibility(); }
    }
  }, 60);
}

export function watchNativeGroupVisibility() {
  chrome.tabs.onActivated.addListener(queueNativeGroupVisibility);
  chrome.tabs.onUpdated.addListener((_id, changes) => {
    if (Object.prototype.hasOwnProperty.call(changes, 'groupId')) queueNativeGroupVisibility();
  });
  chrome.tabs.onAttached.addListener(queueNativeGroupVisibility);
  chrome.tabs.onDetached.addListener(queueNativeGroupVisibility);
  chrome.tabs.onRemoved.addListener(queueNativeGroupVisibility);
  chrome.tabGroups.onCreated.addListener(queueNativeGroupVisibility);
  chrome.tabGroups.onUpdated.addListener(queueNativeGroupVisibility);
  chrome.runtime.onStartup.addListener(queueNativeGroupVisibility);
  chrome.runtime.onInstalled.addListener(queueNativeGroupVisibility);
  chrome.storage.onChanged.addListener((changes, area) => {
    if ((area === 'session' && changes.arcSidebarNativeGroups) || (area === 'local' && changes.arcSidebarModel)) queueNativeGroupVisibility();
  });
  queueNativeGroupVisibility();
}
