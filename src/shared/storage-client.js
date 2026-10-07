// Each feature keeps the exact baseline of objects it read. This avoids global
// monkey-patching and lets an editor safely save after another view changed.
export function createStorageClient({ transact, isActive } = {}) {
  const baselines = { local: new Map(), session: new Map() };
  const objects = new WeakMap();
  const copy = value => value === undefined ? undefined : structuredClone(value);
  const remember = (area, key, value) => {
    const baseline = copy(value);
    baselines[area].set(key, baseline);
    if (value && typeof value === 'object') objects.set(value, baseline);
  };
  chrome.storage.onChanged.addListener((changes, area) => {
    if (!baselines[area] || (isActive && !isActive())) return;
    for (const [key, change] of Object.entries(changes)) {
      if (baselines[area].has(key)) remember(area, key, change.newValue);
    }
  });
  const send = async request => {
    try {
      if (transact) return await transact(structuredClone(request));
      const response = await chrome.runtime.sendMessage({ type: 'arc-sidebar-storage-commit', request });
      if (!response?.ok) { const error = new Error(response?.error || 'Sidebar save failed'); error.code = response?.code; throw error; }
      return response.values;
    } catch (error) {
      if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent('arc-sidebar-save-error', { detail: { message: error.message, code: error.code } }));
      throw error;
    }
  };
  const areaClient = area => ({
    async get(keys) {
      const values = await chrome.storage[area].get(keys);
      for (const [key, value] of Object.entries(values)) remember(area, key, value);
      // Missing requested keys must also have a known empty baseline.
      for (const key of typeof keys === 'string' ? [keys] : Array.isArray(keys) ? keys : Object.keys(keys || {})) {
        if (!(key in values)) remember(area, key, undefined);
      }
      return values;
    },
    async set(values, { before: explicit = {} } = {}) {
      const changes = Object.entries(values).map(([key, after]) => ({ key, after, before: Object.prototype.hasOwnProperty.call(explicit, key) ? explicit[key] : objects.has(after) ? objects.get(after) : baselines[area].get(key) }));
      const result = await send({ area, action: 'set', changes });
      for (const [key, value] of Object.entries(result || {})) remember(area, key, value);
    },
    async patch(key, patch) {
      const result = await send({ area, action: 'set', changes: [{ key, before: {}, after: patch }] });
      for (const [name, value] of Object.entries(result || {})) remember(area, name, value);
    },
    remove: keys => send({ area, action: 'remove', keys }),
    clear: () => send({ area, action: 'clear' })
  });
  return {
    local: areaClient('local'), session: areaClient('session'),
    async snapshot(areas) {
      const result = await send({ action: 'snapshot', areas });
      for (const [area, values] of Object.entries(result)) {
        for (const [key, value] of Object.entries(values)) remember(area, key, value);
        for (const key of typeof areas[area] === 'string' ? [areas[area]] : areas[area] || []) if (!(key in values)) remember(area, key, undefined);
      }
      return result;
    },
    async transaction(areas) {
      const operations = Object.entries(areas).map(([area, values]) => ({ area, action: 'set', changes: Object.entries(values).map(([key, after]) => ({ key, after, before: objects.has(after) ? objects.get(after) : baselines[area].get(key) })) }));
      const result = await send({ action: 'batch', operations });
      for (const [area, values] of Object.entries(result || {})) for (const [key, value] of Object.entries(values)) remember(area, key, value);
    }
  };
}
