(() => {
  const STORAGE_KEY = 'arcSidebarModel';
  const STATE_KEY = 'arcSidebarState';
  const BINDINGS_KEY = 'arcSidebarBindings';
  const OPEN_TABS_SPACE_ID = '__open_tabs__';
  const TAB_ID_NONE = -1;

  async function expandAndActivateTab(tabId) {
    const tab = await chrome.tabs.get(tabId);
    if (tab.groupId != null && tab.groupId !== TAB_ID_NONE) {
      try {
        await chrome.tabGroups.update(tab.groupId, { collapsed: false });
      } catch {}
    }
    await chrome.tabs.update(tabId, { active: true });
    if (tab.windowId != null) {
      try { await chrome.windows.update(tab.windowId, { focused: true }); } catch {}
    }
  }

  async function focusOrOpen(item) {
    if (!item?.id || !item?.url) return;

    const stored = await chrome.storage.session.get(BINDINGS_KEY);
    const bindings = stored[BINDINGS_KEY] || {};
    const tabId = bindings[item.id];

    if (tabId != null) {
      try {
        await expandAndActivateTab(tabId);
        return;
      } catch {
        delete bindings[item.id];
        await chrome.storage.session.set({ [BINDINGS_KEY]: bindings });
      }
    }

    const created = await chrome.tabs.create({ url: item.url, active: true });
    if (created?.id != null) {
      bindings[item.id] = created.id;
      await chrome.storage.session.set({ [BINDINGS_KEY]: bindings });
    }
  }

  function findItemByUrl(nodes, url) {
    for (const node of nodes || []) {
      if (node?.type === 'tab' && node.url === url) return node;
      if (node?.type === 'folder') {
        const found = findItemByUrl(node.children || [], url);
        if (found) return found;
      }
    }
    return null;
  }

  async function resolveSavedItem(target) {
    const favorite = target.closest('.favorite-tile');
    if (favorite) {
      const stored = await chrome.storage.local.get(STORAGE_KEY);
      const favorites = stored[STORAGE_KEY]?.favorites || [];
      const tiles = [...document.querySelectorAll('#favorites .favorite-tile')];
      const index = tiles.indexOf(favorite);
      return index >= 0 ? favorites[index] || null : null;
    }

    const row = target.closest('#pinned .row');
    if (!row) return null;

    const url = row.title || '';
    if (!url) return null;

    const stored = await chrome.storage.local.get([STORAGE_KEY, STATE_KEY]);
    const model = stored[STORAGE_KEY];
    const state = stored[STATE_KEY] || {};
    if (!model || state.currentSpaceId === OPEN_TABS_SPACE_ID) return null;

    const space = model.spaces?.find(item => item.id === state.currentSpaceId) || model.spaces?.[0];
    return findItemByUrl(space?.children || [], url);
  }

  async function activateOpenRow(target) {
    const row = target.closest('#openTabs .row');
    if (!row) return false;
    const url = row.title || '';
    if (!url) return false;

    const tabs = await chrome.tabs.query({ currentWindow: true });
    const tab = tabs.find(item => (item.url || item.pendingUrl || '') === url);
    if (!tab?.id) return false;

    await expandAndActivateTab(tab.id);
    return true;
  }

  document.addEventListener('click', async event => {
    if (!(event.target instanceof Element)) return;

    // Let dedicated controls keep their own behavior.
    if (event.target.closest('.reset-pinned,.favorite-reset,.close-tab,.folder-header,.space-button,.section-add-button,.add-favorite-button')) return;

    const isOpenRow = Boolean(event.target.closest('#openTabs .row'));
    const isSavedLink = Boolean(event.target.closest('.favorite-tile,#pinned .row'));
    if (!isOpenRow && !isSavedLink) return;

    // Intercept before index.js bubble handlers. Activating a tab inside a collapsed
    // native Chrome group can fail; expand the group first, then activate it.
    event.preventDefault();
    event.stopImmediatePropagation();

    try {
      if (isOpenRow) {
        await activateOpenRow(event.target);
        return;
      }

      const item = await resolveSavedItem(event.target);
      if (item) await focusOrOpen(item);
    } catch (error) {
      console.error('Arc Sidebar: tab activation failed', error);
    }
  }, true);
})();