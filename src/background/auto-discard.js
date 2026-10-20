import { createDiscardController, DISCARD_ALARM, DISCARD_IDLE_KEY } from './discard-controller.js';
import { DISCARD_MINUTES_KEY, DISCARD_EXCEPTIONS_KEY } from '../shared/auto-discard.js';
export const autoDiscard = createDiscardController(chrome);
autoDiscard.start().catch(console.warn);
chrome.alarms.onAlarm.addListener(alarm => { if (alarm.name === DISCARD_ALARM) autoDiscard.alarm().catch(console.warn); });
chrome.tabs.onActivated.addListener(info => { autoDiscard.activated(info).catch(console.warn); });
chrome.tabs.onCreated.addListener(tab => { autoDiscard.updated(tab.id, {}, tab).catch(console.warn); });
chrome.tabs.onUpdated.addListener((id, info, tab) => {
  if (info.url || info.status || 'discarded' in info || 'audible' in info || 'pinned' in info || 'autoDiscardable' in info) autoDiscard.updated(id, info, tab).catch(console.warn);
});
chrome.tabs.onRemoved.addListener(id => { autoDiscard.removed(id).catch(console.warn); });
chrome.tabs.onAttached.addListener(() => { autoDiscard.refresh().catch(console.warn); });
chrome.tabs.onDetached.addListener(() => { autoDiscard.refresh().catch(console.warn); });
chrome.runtime.onStartup.addListener(() => { autoDiscard.configure().catch(console.warn); });
chrome.runtime.onInstalled.addListener(() => { autoDiscard.configure().catch(console.warn); });
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'local' && (changes[DISCARD_MINUTES_KEY] || changes[DISCARD_EXCEPTIONS_KEY])) autoDiscard.configure().catch(console.warn);
  if (area === 'session' && changes[DISCARD_IDLE_KEY] && changes[DISCARD_IDLE_KEY].newValue === undefined) autoDiscard.resetSession().catch(console.warn);
});
