const params = new URLSearchParams(location.search);

// The same sidebar page is also loaded inside the hover overlay iframe.
// Only the real Chrome Side Panel should announce native-panel presence.
if (params.get('overlay') !== '1') {
  const port = chrome.runtime.connect({ name: 'arc-native-sidepanel' });

  chrome.windows.getCurrent().then(window => {
    if (window?.id != null) port.postMessage({ windowId: window.id });
  }).catch(() => {});
}
