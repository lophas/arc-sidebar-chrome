const params = new URLSearchParams(location.search);

// The same sidebar page is also loaded inside the hover overlay iframe.
// Only the real Chrome Side Panel should announce native-panel presence.
if (params.get('overlay') !== '1') {
  const port = chrome.runtime.connect({ name: 'arc-native-sidepanel' });

  (async () => {
    let window;
    try { window = await chrome.windows.getCurrent(); } catch {}
    // Older Chrome builds do not attach a browser window to side-panel views.
    if (!window || window.id < 0) window = await chrome.windows.getLastFocused();
    if (window?.id >= 0) port.postMessage({ windowId: window.id });
  })().catch(() => {});
}
