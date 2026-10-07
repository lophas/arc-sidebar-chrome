const clone = value => value === undefined ? undefined : structuredClone(value);
const equal = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const own = (value, key) => Object.prototype.hasOwnProperty.call(value || {}, key);
const keyed = value => Array.isArray(value) && value.every(item => object(item) && typeof item.id === 'string') && new Set(value.map(item => item.id)).size === value.length;

export class StateConflict extends Error {
  constructor(path) { super(`Sidebar changed elsewhere (${path || 'root'}). Reopen the editor and try again.`); this.code = 'STATE_CONFLICT'; }
}

// Apply the user's change to the latest value, preserving unrelated edits.
// Arrays of sidebar nodes merge by stable ID, never by a possibly stale index.
export function mergeChange(latest, before, after, { strict = true, path = '' } = {}) {
  if (equal(before, after)) return clone(latest);
  if (object(after) && (object(before) || (!strict && before === undefined))) {
    before ||= {};
    if (!strict && latest === undefined) latest = {};
    if (!object(latest)) { if (equal(latest, after)) return clone(latest); throw new StateConflict(path); }
    const next = clone(latest);
    for (const key of new Set([...Object.keys(before), ...Object.keys(after)])) {
      if (['__proto__', 'prototype', 'constructor'].includes(key)) throw new Error('Invalid state key');
      if (equal(before[key], after[key]) && own(before, key) === own(after, key)) continue;
      const value = mergeChange(latest[key], before[key], after[key], { strict, path: `${path}/${key}` });
      if (own(after, key)) next[key] = value; else delete next[key];
    }
    return next;
  }
  if (keyed(before) && keyed(after) && keyed(latest)) {
    const ids = list => list.map(item => item.id);
    const oldIds = ids(before), newIds = ids(after), liveIds = ids(latest);
    const structureChanged = !equal(oldIds, newIds);
    if (structureChanged && !equal(liveIds, oldIds)) {
      if (equal(latest, after)) return clone(latest);
      throw new StateConflict(path);
    }
    const oldMap = new Map(before.map(item => [item.id, item]));
    const newMap = new Map(after.map(item => [item.id, item]));
    const liveMap = new Map(latest.map(item => [item.id, item]));
    for (const item of before) {
      if (!newMap.has(item.id) && !equal(item, liveMap.get(item.id))) throw new StateConflict(`${path}/${item.id}`);
    }
    const order = structureChanged ? newIds : liveIds;
    for (const item of after) {
      if (oldMap.has(item.id) && !liveMap.has(item.id) && !equal(item, oldMap.get(item.id))) throw new StateConflict(`${path}/${item.id}`);
    }
    return order.map(id => {
      if (!newMap.has(id) || !oldMap.has(id)) return clone(newMap.get(id) || liveMap.get(id));
      return mergeChange(liveMap.get(id), oldMap.get(id), newMap.get(id), { strict, path: `${path}/${id}` });
    });
  }
  if (strict && !equal(latest, before) && !equal(latest, after)) throw new StateConflict(path);
  return clone(after);
}

export function recalcModelStats(model) {
  if (!model) return model;
  const stats = { spaces: model.spaces?.length || 0, folders: 0, tabs: 0, favorites: model.favorites?.length || 0 };
  const walk = nodes => { for (const node of nodes || []) { if (node.type === 'tab') stats.tabs++; if (node.type === 'folder') { stats.folders++; walk(node.children); } } };
  for (const space of model.spaces || []) walk(space.children);
  return { ...model, stats };
}
