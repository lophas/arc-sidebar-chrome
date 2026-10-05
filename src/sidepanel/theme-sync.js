(() => {
  const root = document.documentElement;
  const media = window.matchMedia('(prefers-color-scheme: dark)');
  const params = new URLSearchParams(location.search);
  const overlayTheme = params.get('theme');

  let parentTheme = overlayTheme === 'dark' || overlayTheme === 'light' ? overlayTheme : null;

  function systemTheme() {
    return media.matches ? 'dark' : 'light';
  }

  function applyTheme(theme = parentTheme || systemTheme()) {
    const normalized = theme === 'dark' ? 'dark' : 'light';
    root.dataset.theme = normalized;
    root.style.colorScheme = normalized;
  }

  applyTheme();

  media.addEventListener('change', () => {
    if (!parentTheme) applyTheme();
  });

  window.addEventListener('message', event => {
    if (window.parent === window || event.source !== window.parent) return;
    if (event.data?.type !== 'arc-sidebar-theme') return;
    if (event.data.theme !== 'dark' && event.data.theme !== 'light') return;
    parentTheme = event.data.theme;
    applyTheme(parentTheme);
  });
})();
