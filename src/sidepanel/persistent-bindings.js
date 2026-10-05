(() => {
  const SESSION_KEY = 'arcSidebarBindings';
  const PERSIST_KEY = 'arcSidebarPersistentBindings';
  const SNAPSHOT_DELAY = 120;

  let sessionBindings = {};
  let persistentBindings = {};
  let itemByTabId = new Map();
  let initialized = false;
  const snapshotTimers = new Map();

  const normalizeUrl = value => {
    if (!value) return '';
    try {
      const url = new URL(value);
      url.hash = '';
      return url.href;
    } catch {
      return value;
    }
  };

  function rebuildReverseIndex() {
    itemByTabId = new Map();
    for (const [itemId, tabId] of Object.entries(sessionBindings)) {
      if (tabId != null) itemByTabId.set(Number(tabId), itemId);
    }
  }

  async function persistBindings() {
    await chrome.storage.local.set({ [PERSIST_KEY]: persistentBindings });
  }

  async function snapshotBinding(itemId, tabId) {
    try {
      const tab = await chrome.tabs.get(Number(tabId));
      const currentUrl = tab.pendingUrl || tab.url || '';
      if (!currentUrl) return false;
      persistentBindings[itemId] = {
        url: currentUrl,
        normalizedUrl: normalizeUrl(currentUrl),
        title: tab.title || '',
        index: Number.isInteger(tab.index) ? tab.index : null,
        updatedAt: Date.now()
      };
      return true;
    } catch {
      return false;
    }
  }

  function scheduleSnapshot(itemId, tabId, delay = SNAPSHOT_DELAY) {
    const previous = snapshotTimers.get(itemId);
    if (previous) clearTimeout(previous);
    snapshotTimers.set(itemId, setTimeout(async () => {
      snapshotTimers.delete(itemId);
      if (sessionBindings[itemId] !== tabId) return;
      if (await snapshotBinding(itemId, tabId)) await persistBindings();
    }, delay));
  }

  function candidateScore(tab, saved) {
    const current = normalizeUrl(tab.pendingUrl || tab.url || '');
    const expected = saved.normalizedUrl || normalizeUrl(saved.url);
    if (!current || current !== expected) return -1;
    let score = 100;
    if (saved.title && tab.title && saved.title === tab.title) score += 10;
    if (saved.index != null && tab.index === saved.index) score += 5;
    return score;
  }

  async function restoreSessionBindings() {
    const tabs = await chrome.tabs.query({});
    if (!Object.keys(persistentBindings).length) return false;

    const next = { ...sessionBindings };
    const claimed = new Set(Object.values(next).map(Number));
    let restored = false;

    for (const [itemId, saved] of Object.entries(persistentBindings)) {
      if (next[itemId] != null) continue;
      let bestTab = null;
      let bestScore = -1;
      for (const tab of tabs) {
        if (tab.id == null || claimed.has(tab.id)) continue;
        const score = candidateScore(tab, saved);
        if (score > bestScore) {
          bestScore = score;
          bestTab = tab;
        }
      }
      if (bestTab?.id != null && bestScore >= 100) {
        next[itemId] = bestTab.id;
        claimed.add(bestTab.id);
        restored = true;
      }
    }

    if (restored) {
      sessionBindings = next;
      rebuildReverseIndex();
      await chrome.storage.session.set({ [SESSION_KEY]: next });
    }
    return restored;
  }

  async function initialize() {
    const [session, local] = await Promise.all([
      chrome.storage.session.get(SESSION_KEY),
      chrome.storage.local.get(PERSIST_KEY)
    ]);
    sessionBindings = session[SESSION_KEY] || {};
    persistentBindings = local[PERSIST_KEY] || {};
    rebuildReverseIndex();
    initialized = true;
    await restoreSessionBindings();
  }

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== 'session' || !changes[SESSION_KEY]) return;
    const oldBindings = changes[SESSION_KEY].oldValue || {};
    sessionBindings = changes[SESSION_KEY].newValue || {};
    rebuildReverseIndex();

    let removed = false;
    for (const itemId of Object.keys(oldBindings)) {
      if (!(itemId in sessionBindings) && itemId in persistentBindings) {
        delete persistentBindings[itemId];
        removed = true;
      }
    }
    if (removed) persistBindings().catch(() => {});

    for (const [itemId, tabId] of Object.entries(sessionBindings)) {
      if (oldBindings[itemId] !== tabId) scheduleSnapshot(itemId, tabId, 0);
    }
  });

  chrome.tabs.onUpdated.addListener((tabId, changeInfo) => {
    if (!initialized) return;
    if (!changeInfo.url && !changeInfo.title && changeInfo.status !== 'complete') return;
    const itemId = itemByTabId.get(Number(tabId));
    if (itemId) scheduleSnapshot(itemId, tabId);
  });

  chrome.tabs.onMoved.addListener(tabId => {
    if (!initialized) return;
    const itemId = itemByTabId.get(Number(tabId));
    if (itemId) scheduleSnapshot(itemId, tabId);
  });

  chrome.tabs.onReplaced.addListener((addedTabId, removedTabId) => {
    if (!initialized) return;
    const itemId = itemByTabId.get(Number(removedTabId));
    if (itemId) scheduleSnapshot(itemId, addedTabId, 0);
  });

  initialize().catch(error => console.warn('Arc Sidebar: persistent binding restore failed', error));
})();
