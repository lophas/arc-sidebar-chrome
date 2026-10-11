import { autoPipSite, openAutoPipSiteSettings } from '../shared/auto-pip-settings.js';

chrome.runtime.onMessage.addListener((message, sender, respond) => {
  if (message?.type !== 'arc-auto-pip-open-settings') return;
  if (sender.id !== chrome.runtime.id || sender.frameId !== 0 || sender.tab?.id == null || !autoPipSite(sender.tab)) {
    respond({ ok: false, error: 'Open an HTTPS video page first.' });
    return;
  }
  openAutoPipSiteSettings(sender.tab.id)
    .then(() => respond({ ok: true }))
    .catch(error => respond({ ok: false, error: error.message }));
  return true;
});
