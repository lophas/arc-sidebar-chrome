(() => {
  const SESSION_KEY = 'arcSidebarBindings';
  const PERSIST_KEY = 'arcSidebarPersistentBindings';

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

  async function readSessionBindings() {
    const stored = await chrome.storage.session.get(SESSION_KEY);
    return stored[SESSION_KEY] || {};
  }

  async function readPersistentBindings() {
    const stored = await chrome.storage.local.get(PERSIST_KEY);
    return stored[PERSIST_KEY] || {};
  }

  async function writePersistentBindings(value) {
    await chrome.storage.local.set({ [PERSIST_KEY]: value });
  }

  async function snapshotBinding(itemId, tabId, persistent) {
    try {
      const tab = await chrome.tabs.get(tabId);
      const currentUrl = tab.pendingUrl || tab.url || '';
      if (!currentUrl) return false;

      persistent[itemId] = {
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

  async function syncPersistentFromSession(oldBindings = null, newBindings = null) {
    const persistent = await readPersistentBindings();
    const bindings = newBindings || await readSessionBindings();

    if (oldBindings) {
      for (const itemId of Object.keys(oldBindings)) {
        if (!(itemId in bindings)) delete persistent[itemId];
      }
    }

    let changed = false;
    for (const [itemId, tabId] of Object.entries(bindings)) {
      if (await snapshotBinding(itemId, tabId, persistent)) changed = true;
    }

    if (oldBindings) changed = true;
    if (changed) await writePersistentBindings(persistent);
  }

  function candidateScore(tab, saved) {
    const current = normalizeUrl(tab.pendingUrl || tab.url || '');
    if (!current || current !== (saved.normalizedUrl || normalizeUrl(saved.url))) return -1;

    let score = 100;
    if (saved.title && tab.title && saved.title === tab.title) score += 10;
    if (saved.index != null && tab.index === saved.index) score += 5;
    return score;
  }

  async function restoreSessionBindings() {
    const [existing, persistent, tabs] = await Promise.all([
      readSessionBindings(),
      readPersistentBindings(),
      chrome.tabs.query({})
    ]);

    if (!Object.keys(persistent).length) return false;

    const next = { ...existing };
    const claimedTabIds = new Set(Object.values(next));
    let restored = false;

    for (const [itemId, saved] of Object.entries(persistent)) {
      if (next[itemId] != null) continue;

      let bestTab = null;
      let bestScore = -1;
      for (const tab of tabs) {
        if (tab.id == null || claimedTabIds.has(tab.id)) continue;
        const score = candidateScore(tab, saved);
        if (score > bestScore) {
          bestScore = score;
          bestTab = tab;
        }
      }

      if (bestTab?.id != null && bestScore >= 100) {
        next[itemId] = bestTab.id;
        claimedTabIds.add(bestTab.id);
        restored = true;
      }
    }

    if (restored) {
      await chrome.storage.session.set({ [SESSION_KEY]: next });
    }
    return restored;
  }

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== 'session' || !changes[SESSION_KEY]) return;
    const change = changes[SESSION_KEY];
    syncPersistentFromSession(change.oldValue || {}, change.newValue || {}).catch(() => {});
  });

  chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
    if (!changeInfo.url && !changeInfo.title && changeInfo.status !== 'complete') return;

    const bindings = await readSessionBindings();
    const itemId = Object.keys(bindings).find(id => bindings[id] === tabId);
    if (!itemId) return;

    const persistent = await readPersistentBindings();
    const currentUrl = tab.pendingUrl || tab.url || '';
    if (!currentUrl) return;

    persistent[itemId] = {
      url: currentUrl,
      normalizedUrl: normalizeUrl(currentUrl),
      title: tab.title || '',
      index: Number.isInteger(tab.index) ? tab.index : null,
      updatedAt: Date.now()
    };
    await writePersistentBindings(persistent);
  });

  chrome.tabs.onMoved.addListener(async tabId => {
    const bindings = await readSessionBindings();
    const itemId = Object.keys(bindings).find(id => bindings[id] === tabId);
    if (!itemId) return;
    const persistent = await readPersistentBindings();
    if (await snapshotBinding(itemId, tabId, persistent)) await writePersistentBindings(persistent);
  });

  restoreSessionBindings().then(restored => {
    // index.js may already have loaded the empty session binding map. One reload
    // is enough to let it consume the reconstructed runtime bindings.
    if (restored && !sessionStorage.getItem('arcSidebarBindingsRestored')) {
      sessionStorage.setItem('arcSidebarBindingsRestored', '1');
      location.reload();
    }
  }).catch(() => {});
})();