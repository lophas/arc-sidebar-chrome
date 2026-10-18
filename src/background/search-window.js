export function createSearchWindowController(api = chrome) {
  let pending = Promise.resolve();
  const searchUrl = api.runtime.getURL('src/sidepanel/command.html');
  async function open(tab) {
    // Discover existing windows each time, including after a service-worker
    // restart. The promise queue also prevents rapid shortcuts creating twins.
    const windows = await api.windows.getAll({ populate: true, windowTypes: ['popup'] });
    const existing = windows.filter(window => window.tabs?.some(tab =>
      [tab.url, tab.pendingUrl].some(url => url === searchUrl || url?.startsWith(searchUrl + '?'))));
    const target = existing.find(window => window.focused) || existing[0];
    if (target) {
      for (const duplicate of existing.filter(window => window.id !== target.id)) {
        await api.windows.remove(duplicate.id).catch(() => {});
      }
      try {
        await api.windows.update(target.id, {
          focused: true, ...(target.state === 'minimized' ? { state: 'normal' } : {})
        });
        return;
      } catch { /* It was closed while discovering windows; open a replacement. */ }
    }
    let source = tab?.windowId != null ? await api.windows.get(tab.windowId) : null;
    if (!source || source.type !== 'normal') source = await api.windows.getLastFocused({ windowTypes: ['normal'] });
    const sourceTabId = tab?.windowId === source.id && tab.id != null ? tab.id
      : (await api.tabs.query({ active: true, windowId: source.id }))[0]?.id;
    const width = Math.min(640, source.width || 640), height = Math.min(520, source.height || 520);
    await api.windows.create({
      type: 'popup', url: `${searchUrl}?windowId=${source.id}&sourceTabId=${sourceTabId ?? ''}`,
      width, height,
      left: Math.max(0, Math.round((source.left || 0) + ((source.width || width) - width) / 2)),
      top: Math.max(0, Math.round((source.top || 0) + ((source.height || height) - height) / 3))
    });
  }
  return tab => {
    const request = pending.catch(() => {}).then(() => open(tab));
    pending = request;
    return request;
  };
}
