async function revealPinnedSpace(tabId, savedId) {
  const [stored, session] = await Promise.all([
    chrome.storage.local.get(['arcSidebarModel', 'arcSidebarState']),
    chrome.storage.session.get('arcSidebarBindings')
  ]);
  const bindings = session.arcSidebarBindings || {};
  const walk = (nodes, ancestors = []) => {
    for (const node of nodes || []) {
      if (node.type === 'tab' && (savedId ? node.id === savedId : Number(bindings[node.id]) === tabId)) return ancestors;
      if (node.type === 'folder') {
        const found = walk(node.children, [...ancestors, node.id]);
        if (found) return found;
      }
    }
    return null;
  };
  for (const space of stored.arcSidebarModel?.spaces || []) {
    const ancestors = walk(space.children);
    if (!ancestors) continue;
    const state = stored.arcSidebarState || {};
    state.currentSpaceId = space.id;
    state.collapsedFolders = { ...state.collapsedFolders };
    for (const id of ancestors) state.collapsedFolders[id] = false;
    await chrome.storage.local.set({ arcSidebarState: state });
    return;
  }
}

chrome.commands.onCommand.addListener(async (command, tab) => {
  if (command !== 'arc-command-bar-v3') return;
  try {
    const source = tab?.windowId != null ? await chrome.windows.get(tab.windowId) : await chrome.windows.getLastFocused({ windowTypes: ['normal'] });
    const width = Math.min(640, source.width || 640), height = Math.min(520, source.height || 520);
    await chrome.windows.create({ type: 'popup', url: chrome.runtime.getURL(`src/sidepanel/command.html?windowId=${source.id}`), width, height,
      left: Math.max(0, Math.round((source.left || 0) + ((source.width || width) - width) / 2)),
      top: Math.max(0, Math.round((source.top || 0) + ((source.height || height) - height) / 3)) });
  } catch (error) { console.error('Arc command bar:', error); }
});

chrome.runtime.onMessage.addListener((message, sender, respond) => {
  if (message?.type !== 'arc-command-execute' || sender.id !== chrome.runtime.id) return;
  const run = async () => {
    const item = message.item;
    if (item.kind === 'Open tab') {
      const tab = await chrome.tabs.get(item.tabId);
      if (tab.groupId !== -1) await chrome.tabGroups.update(tab.groupId, { collapsed: false });
      await chrome.tabs.update(tab.id, { active: true });
      await chrome.windows.update(tab.windowId, { focused: true });
      await revealPinnedSpace(tab.id);
    } else if (['Pinned', 'Favorite', 'URL', 'Search'].includes(item.kind)) {
      const windowId = message.windowId;
      const stored = await chrome.storage.session.get('arcSidebarBindings');
      const bindings = stored.arcSidebarBindings || {};
      let tab;
      if (item.id && bindings[item.id] != null) {
        try { tab = await chrome.tabs.get(Number(bindings[item.id])); } catch {}
      }
      if (tab) {
        if (tab.groupId !== -1) await chrome.tabGroups.update(tab.groupId, { collapsed: false });
        await chrome.tabs.update(tab.id, { active: true });
        await chrome.windows.update(tab.windowId, { focused: true });
      } else {
        const url = new URL(item.url);
        if (!['http:', 'https:', 'chrome:', 'file:'].includes(url.protocol)) throw new Error('Unsupported URL');
        tab = await chrome.tabs.create({ windowId, url: url.href, active: true });
        if (item.id) await chrome.storage.session.set({ arcSidebarBindings: { ...bindings, [item.id]: tab.id } });
        await chrome.windows.update(windowId, { focused: true });
      }
      if (item.kind === 'Pinned') await revealPinnedSpace(tab.id, item.id);
    } else if (['Folder', 'Space'].includes(item.kind)) {
      const stored = await chrome.storage.local.get('arcSidebarState');
      const state = stored.arcSidebarState || {};
      state.currentSpaceId = item.spaceId;
      state.collapsedFolders = { ...state.collapsedFolders };
      for (const id of item.ancestors || []) state.collapsedFolders[id] = false;
      if (item.kind === 'Folder') state.collapsedFolders[item.id] = false;
      await chrome.storage.local.set({ arcSidebarState: state });
    } else throw new Error('Unknown command');
    return { ok: true };
  };
  run().then(respond).catch(error => respond({ ok: false, error: error.message }));
  return true;
});
