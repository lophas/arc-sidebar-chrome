import { mergeChange, recalcModelStats } from '../shared/state-merge.js';
let tail = Promise.resolve();
export function serializeState(operation) {
  const result = tail.then(operation);
  tail = result.catch(() => {});
  return result;
}
function validateArea(area) {
  if (!['local', 'session'].includes(area)) throw new Error('Invalid storage area');
}
async function prepareSet(request) {
  validateArea(request.area);
  if (request.action !== 'set') throw new Error('Invalid batch operation');
  const changes = request.changes || [];
  const latest = await chrome.storage[request.area].get(changes.map(change => change.key));
  const writes = {};
  for (const change of changes) {
    const key = change.key;
    if (typeof key !== 'string' || !key.startsWith('arcSidebar')) throw new Error('Invalid sidebar storage key');
    const mapKey = ['arcSidebarState', 'arcSidebarScrollPositions', 'arcSidebarBindings', 'arcSidebarPersistentBindings'].includes(key);
    const strict = key === 'arcSidebarModel' || key === 'arcSidebarBindings';
    let before = change.before, after = change.after, current = latest[key];
    if (mapKey) { before ||= {}; after ||= {}; current ||= {}; }
    if (key === 'arcSidebarModel') {
      before = before && { ...before, stats: undefined };
      after = after && { ...after, stats: undefined };
      current = current && { ...current, stats: undefined };
    }
    let merged = mergeChange(current, before, after, { strict, path: key });
    if (key === 'arcSidebarModel') merged = recalcModelStats(merged);
    if (JSON.stringify(merged) !== JSON.stringify(latest[key])) writes[key] = merged;
  }
  return { area: request.area, latest, writes };
}
async function pruneRemovedBindings(prepared) {
  let model = prepared.find(part => part.area === 'local')?.writes.arcSidebarModel;
  const bindingWrite = prepared.find(part => part.area === 'session')?.writes.arcSidebarBindings;
  if (!model && !bindingWrite) return;
  if (!model) model = (await chrome.storage.local.get('arcSidebarModel')).arcSidebarModel;
  const ids = new Set();
  const walk = nodes => { for (const node of nodes || []) { if (node.type === 'tab') ids.add(node.id); if (node.type === 'folder') walk(node.children); } };
  walk(model?.favorites); for (const space of model?.spaces || []) walk(space.children);
  let session = prepared.find(part => part.area === 'session');
  if (!session) { session = { area: 'session', latest: await chrome.storage.session.get('arcSidebarBindings'), writes: {} }; prepared.push(session); }
  const bindings = session.writes.arcSidebarBindings || session.latest.arcSidebarBindings || {};
  const filtered = Object.fromEntries(Object.entries(bindings).filter(([id]) => ids.has(id)));
  if (JSON.stringify(bindings) !== JSON.stringify(filtered)) session.writes.arcSidebarBindings = filtered;
}
export function commitStorage(request) {
  request = structuredClone(request);
  return serializeState(async () => {
    if (request.action === 'snapshot') {
      const values = {};
      for (const [area, keys] of Object.entries(request.areas || {})) { validateArea(area); values[area] = await chrome.storage[area].get(keys); }
      return values;
    }
    if (request.action === 'clear' || request.action === 'remove') {
      validateArea(request.area);
      if (request.action === 'clear') await chrome.storage[request.area].clear();
      else await chrome.storage[request.area].remove(request.keys);
      return {};
    }
    const operations = request.action === 'batch' ? request.operations : [request];
    if (!Array.isArray(operations) || !operations.length || new Set(operations.map(op => op.area)).size !== operations.length) throw new Error('Invalid sidebar batch');
    // Validate every delta before writing any of the batch's storage areas.
    const prepared = [];
    for (const operation of operations) prepared.push(await prepareSet(operation));
    await pruneRemovedBindings(prepared);
    for (const part of prepared) if (Object.keys(part.writes).length) await chrome.storage[part.area].set(part.writes);
    const results = Object.fromEntries(prepared.map(part => [part.area, { ...part.latest, ...part.writes }]));
    return request.action === 'batch' ? results : results[request.area];
  });
}
chrome.runtime.onMessage.addListener((message, sender, respond) => {
  if (message?.type !== 'arc-sidebar-storage-commit') return;
  if (sender.id !== chrome.runtime.id || !sender.url?.startsWith(chrome.runtime.getURL(''))) {
    respond({ ok: false, error: 'Invalid sidebar sender' }); return;
  }
  commitStorage(message.request).then(values => respond({ ok: true, values }))
    .catch(error => respond({ ok: false, error: error.message, code: error.code }));
  return true;
});
