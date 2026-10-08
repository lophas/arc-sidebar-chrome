// Layout is owned by Chrome, not by a separate extension preference.
chrome.runtime.onMessage.addListener((message, sender, respond) => {
  if (message?.type !== 'arc-sidebar-panel-layout') return;
  Promise.resolve().then(async () => {
    const layout = await chrome.sidePanel.getLayout();
    respond({ side: layout.side === 'left' ? 'left' : 'right' });
  }).catch(() => respond({ side: 'right' }));
  return true;
});
