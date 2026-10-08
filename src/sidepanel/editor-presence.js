const params = new URLSearchParams(location.search);
if (params.get('overlay') === '1') {
  let lastOpen = null;

  async function report() {
    const open = Boolean(document.querySelector('dialog[open]'));
    if (open === lastOpen) return;
    lastOpen = open;

    // postMessage is kept for the iframe/parent fast path.
    try {
      window.parent.postMessage({ type: 'arc-sidebar-editor-state', open }, '*');
    } catch {}

    // The background uses sender.tab: never look up the currently active tab,
    // which may already be another page when this iframe unloads or reports.
    try {
      await chrome.runtime.sendMessage({ type: 'arc-sidebar-editor-presence', open });
    } catch {}
  }

  const observer = new MutationObserver(() => { report().catch(() => {}); });
  observer.observe(document.documentElement, {
    subtree: true,
    childList: true,
    attributes: true,
    attributeFilter: ['open']
  });

  window.addEventListener('pagehide', () => {
    observer.disconnect();
    lastOpen = false;
    try { window.parent.postMessage({ type: 'arc-sidebar-editor-state', open: false }, '*'); } catch {}
    chrome.runtime.sendMessage({ type: 'arc-sidebar-editor-presence', open: false }).catch(() => {});
  });
  window.addEventListener('pageshow', () => {
    observer.observe(document.documentElement, { subtree: true, childList: true, attributes: true, attributeFilter: ['open'] });
    lastOpen = null;
    report().catch(() => {});
  });
  window.addEventListener('message', event => {
    if (event.source === window.parent && event.data?.type === 'arc-sidebar-overlay-visibility' && event.data.open) { lastOpen = null; report().catch(() => {}); }
  });

  report().catch(() => {});
}
