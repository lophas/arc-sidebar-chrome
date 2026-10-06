const params = new URLSearchParams(location.search);
if (params.get('overlay') === '1') {
  let lastOpen = null;

  const report = () => {
    const open = Boolean(document.querySelector('dialog[open]'));
    if (open === lastOpen) return;
    lastOpen = open;
    try {
      window.parent.postMessage({ type: 'arc-sidebar-editor-state', open }, '*');
    } catch {}
  };

  const observer = new MutationObserver(report);
  observer.observe(document.documentElement, {
    subtree: true,
    childList: true,
    attributes: true,
    attributeFilter: ['open']
  });

  window.addEventListener('pagehide', () => {
    try {
      window.parent.postMessage({ type: 'arc-sidebar-editor-state', open: false }, '*');
    } catch {}
  }, { once: true });

  report();
}
