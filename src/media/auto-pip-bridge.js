(() => {
  if (window.top !== window) return;
  try {
    if (chrome.runtime.id) chrome.runtime.sendMessage({ type: 'arc-auto-pip-ready' }).catch(() => {});
  } catch {}
})();
