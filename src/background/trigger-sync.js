// Autohide preferences are device-local. Retire the old cloud snapshot without
// applying it to local settings.
const LEGACY_KEY = 'arcSidebarSyncedEdgeTrigger';
export async function clearLegacyTriggerSync() {
  const stored = await chrome.storage.sync.get(LEGACY_KEY);
  if (Object.hasOwn(stored, LEGACY_KEY)) await chrome.storage.sync.remove(LEGACY_KEY);
}
const cleanup = () => clearLegacyTriggerSync().catch(error => {
  console.warn('Arc Side of the Chrome: legacy trigger Sync cleanup failed', error);
});
chrome.runtime.onStartup.addListener(cleanup);
chrome.runtime.onInstalled.addListener(cleanup);
// Do not react to cloud writes: an older version may re-publish after deletion.
// Ignoring those writes avoids a cross-device remove/re-publish loop.
cleanup();
