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

    // Also notify the tab's content script directly. This is more reliable
    // across extension iframe/page isolated-world boundaries than relying on
    // window.postMessage alone.
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (tab?.id != null) {
        await chrome.tabs.sendMessage(tab.id, { type: 'arc-sidebar-editor-state', open });
      }
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
    lastOpen = null;
    report().catch(() => {});
  }, { once: true });

  report().catch(() => {});
}
