const CHILDREN_KEY = 'arcSidebarFavoriteChildFocus';

export async function selectSidebarSpace(info, canContinue, storage, browser = chrome) {
  let tab;
  try { tab = await browser.tabs.get(info.tabId); } catch { return; }
  if (tab.pinned || tab.windowId !== info.windowId) return;
  const { local, session } = await storage.snapshot({
    local: ['arcSidebarModel', 'arcSidebarState'],
    session: ['arcSidebarBindings', 'arcSidebarNativeGroups']
  });
  const spaces = local.arcSidebarModel?.spaces || [];
  const bindings = session.arcSidebarBindings || {};
  const contains = nodes => (nodes || []).some(item =>
    item.type === 'folder' ? contains(item.children) : item.type === 'tab' && Number(bindings[item.id]) === tab.id);
  let space = spaces.find(space => contains(space.children));
  if (!space && tab.groupId >= 0) {
    let group;
    try { group = await browser.tabGroups.get(tab.groupId); } catch { return; }
    space = spaces.find(space => session.arcSidebarNativeGroups?.[`${tab.windowId}:${space.id}`] === group.id &&
      group.windowId === tab.windowId && group.title === space.title);
  }
  if (!space || local.arcSidebarState?.currentSpaceId === space.id) return;
  const [active] = await browser.tabs.query({ windowId: tab.windowId, active: true });
  if (active?.id === tab.id && canContinue()) await storage.local.patch('arcSidebarState', { currentSpaceId: space.id });
}

// Keep only Favorite-child relationships in session storage. Inactive children
// do not steal focus when closed; the relationship survives worker suspension.
export function watchTabFocus(selectSpace, browser = chrome) {
  const versions = new Map();
  let children = {};
  let tail = browser.storage.session.get(CHILDREN_KEY).then(stored => { children = stored[CHILDREN_KEY] || {}; });
  const enqueue = operation => {
    const result = tail.then(operation);
    tail = result.catch(error => console.warn('Arc Side of the Chrome: tab focus update skipped', error));
    return result;
  };
  const save = () => browser.storage.session.set({ [CHILDREN_KEY]: structuredClone(children) });
  browser.storage.onChanged?.addListener((changes, area) => {
    if (area === 'session' && changes[CHILDREN_KEY] && !changes[CHILDREN_KEY].newValue) children = {};
  });
  browser.tabs.onActivated.addListener(info => {
    const version = (versions.get(info.windowId) || 0) + 1;
    versions.set(info.windowId, version);
    enqueue(async () => {
      let changed = false;
      for (const [id, child] of Object.entries(children)) {
        if (child.windowId !== info.windowId) continue;
        const active = Number(id) === info.tabId;
        if (child.active !== active) { child.active = active; changed = true; }
      }
      if (changed) await save();
      if (versions.get(info.windowId) === version) await selectSpace(info, () => versions.get(info.windowId) === version);
    });
  });
  browser.tabs.onRemoved.addListener((tabId, info) => {
    const closeVersion = versions.get(info.windowId) || 0;
    enqueue(async () => {
      const child = children[tabId];
      let changed = false;
      for (const [id, record] of Object.entries(children)) {
        if (Number(id) === tabId || record.openerTabId === tabId || (info.isWindowClosing && record.windowId === info.windowId)) {
          delete children[id]; changed = true;
        }
      }
      if (changed) await save();
      if (!child?.active || info.isWindowClosing || child.windowId !== info.windowId) return;
      // Chrome selects a replacement once. Further selections belong to the
      // user and win even while earlier storage operations are still queued.
      if ((versions.get(info.windowId) || 0) > closeVersion + 1) return;
      try {
        const [active] = await browser.tabs.query({ active: true, windowId: info.windowId });
        const version = versions.get(info.windowId);
        const opener = await browser.tabs.get(child.openerTabId);
        if (active && opener.windowId === info.windowId && versions.get(info.windowId) === version) {
          await browser.tabs.update(opener.id, { active: true });
        }
      } catch { /* The opener or its window may have closed as well. */ }
    });
  });
  browser.tabs.onDetached.addListener(tabId => {
    enqueue(async () => {
      let changed = false;
      for (const [id, child] of Object.entries(children)) if (Number(id) === tabId || child.openerTabId === tabId) {
        delete children[id]; changed = true;
      }
      if (changed) await save();
    });
  });
  return {
    track(candidate) {
      return enqueue(async () => {
        try {
          const tab = await browser.tabs.get(candidate.tabId);
          if (tab.pinned || tab.windowId !== candidate.windowId) return;
          children[tab.id] = { openerTabId: candidate.openerTabId, windowId: tab.windowId, active: tab.active === true };
          await save();
        } catch { /* A short-lived child may close before routing finishes. */ }
      });
    },
    settled: () => tail
  };
}
