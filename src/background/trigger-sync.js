import { EDGE_TRIGGER_KEY, edgeTrigger, isEdgeTrigger } from '../shared/edge-trigger.js';
import { createStorageClient } from '../shared/storage-client.js';
import { commitStorage } from './state-controller.js';
const storage = createStorageClient({ transact: commitStorage });
const CLOUD_KEY = 'arcSidebarSyncedEdgeTrigger';
const ENABLED_KEY = 'arcSidebarSyncEnabled';
let tail = Promise.resolve();
let pushTimer = null;
const same = (a, b) => isEdgeTrigger(a) && isEdgeTrigger(b) && ['height', 'offset', 'width'].every(key => a[key] === b[key]);
function queue(operation) {
  tail = tail.then(operation).catch(error => console.warn('Arc Side of the Chrome: trigger Sync failed', error));
  return tail;
}
async function enabled() { return (await chrome.storage.sync.get(ENABLED_KEY))[ENABLED_KEY] === true; }
async function pullOrSeed() {
  if (!await enabled()) return;
  const cloud = (await chrome.storage.sync.get(CLOUD_KEY))[CLOUD_KEY];
  const local = (await storage.local.get(EDGE_TRIGGER_KEY))[EDGE_TRIGGER_KEY];
  if (!await enabled()) return;
  if (isEdgeTrigger(cloud)) {
    if (!same(local, cloud)) await storage.local.set({ [EDGE_TRIGGER_KEY]: edgeTrigger(cloud) });
  } else if (isEdgeTrigger(local)) {
    // Missing/default settings on a fresh installation or reset never seed Sync.
    await chrome.storage.sync.set({ [CLOUD_KEY]: edgeTrigger(local) });
  }
}
export const reconcileTriggerSync = () => queue(pullOrSeed);
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'local' && isEdgeTrigger(changes[EDGE_TRIGGER_KEY]?.newValue)) {
    const expected = edgeTrigger(changes[EDGE_TRIGGER_KEY].newValue);
    if (pushTimer !== null) clearTimeout(pushTimer);
    pushTimer = setTimeout(() => {
      pushTimer = null;
      queue(async () => {
      if (!await enabled()) return;
      const local = (await storage.local.get(EDGE_TRIGGER_KEY))[EDGE_TRIGGER_KEY];
      // Ignore delayed changes superseded by another edit, remote pull or reset.
      if (!same(local, expected)) return;
      const cloud = (await chrome.storage.sync.get(CLOUD_KEY))[CLOUD_KEY];
      if (!same(cloud, expected) && await enabled()) await chrome.storage.sync.set({ [CLOUD_KEY]: expected });
      });
    }, 350);
  }
  if (area === 'sync' && changes[ENABLED_KEY]?.newValue === false && pushTimer !== null) { clearTimeout(pushTimer); pushTimer = null; }
  if (area === 'sync' && (changes[CLOUD_KEY] || changes[ENABLED_KEY]?.newValue === true)) queue(pullOrSeed);
});
chrome.runtime.onStartup.addListener(() => queue(pullOrSeed));
chrome.runtime.onInstalled.addListener(() => queue(pullOrSeed));
