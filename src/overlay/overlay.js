(() => {
  if (window.top !== window) return;
  if (document.documentElement.dataset.arcSidebarOverlayInjected === '1') return;
  document.documentElement.dataset.arcSidebarOverlayInjected = '1';

  const PANEL_WIDTH = 390;
  const EDGE_WIDTH = 7;
  const SHOW_DELAY = 80;
  const HIDE_DELAY = 320;

  const host = document.createElement('div');
  host.id = 'arc-sidebar-overlay-host';
  host.style.all = 'initial';
  document.documentElement.append(host);

  const shadow = host.attachShadow({ mode: 'closed' });
  shadow.innerHTML = `
    <style>
      :host { all: initial; }
      .edge {
        position: fixed;
        top: 0;
        right: 0;
        width: ${EDGE_WIDTH}px;
        height: 100vh;
        z-index: 2147483646;
        background: transparent;
        pointer-events: auto;
      }
      .panel {
        position: fixed;
        top: 0;
        right: 0;
        width: min(${PANEL_WIDTH}px, 46vw);
        height: 100vh;
        z-index: 2147483647;
        transform: translateX(100%);
        transition: transform 170ms cubic-bezier(.2,.8,.2,1), box-shadow 170ms ease;
        background: #171719;
        box-shadow: none;
        overflow: hidden;
        pointer-events: none;
        border-left: 1px solid rgba(255,255,255,.08);
      }
      .panel.open {
        transform: translateX(0);
        box-shadow: -18px 0 42px rgba(0,0,0,.34);
        pointer-events: auto;
      }
      iframe {
        width: 100%;
        height: 100%;
        border: 0;
        display: block;
        background: #171719;
      }
    </style>
    <div class="edge" aria-hidden="true"></div>
    <div class="panel" role="complementary" aria-label="Arc Sidebar">
      <iframe title="Arc Sidebar" src="${chrome.runtime.getURL('src/sidepanel/index.html?overlay=1')}"></iframe>
    </div>`;

  const edge = shadow.querySelector('.edge');
  const panel = shadow.querySelector('.panel');
  let showTimer = null;
  let hideTimer = null;
  let isOpen = false;

  const clearTimers = () => {
    if (showTimer) clearTimeout(showTimer);
    if (hideTimer) clearTimeout(hideTimer);
    showTimer = null;
    hideTimer = null;
  };

  const openPanel = () => {
    if (hideTimer) clearTimeout(hideTimer);
    hideTimer = null;
    if (isOpen) return;
    isOpen = true;
    panel.classList.add('open');
  };

  const closePanel = () => {
    if (showTimer) clearTimeout(showTimer);
    showTimer = null;
    if (!isOpen) return;
    isOpen = false;
    panel.classList.remove('open');
  };

  const scheduleOpen = () => {
    if (hideTimer) clearTimeout(hideTimer);
    hideTimer = null;
    if (isOpen || showTimer) return;
    showTimer = setTimeout(() => {
      showTimer = null;
      openPanel();
    }, SHOW_DELAY);
  };

  const scheduleClose = () => {
    if (showTimer) clearTimeout(showTimer);
    showTimer = null;
    if (!isOpen) return;
    if (hideTimer) clearTimeout(hideTimer);
    hideTimer = setTimeout(() => {
      hideTimer = null;
      closePanel();
    }, HIDE_DELAY);
  };

  edge.addEventListener('mouseenter', scheduleOpen);
  edge.addEventListener('mouseleave', () => {
    if (!isOpen && showTimer) {
      clearTimeout(showTimer);
      showTimer = null;
    }
  });

  panel.addEventListener('mouseenter', () => {
    if (hideTimer) clearTimeout(hideTimer);
    hideTimer = null;
  });
  panel.addEventListener('mouseleave', scheduleClose);

  document.addEventListener('keydown', event => {
    if (event.key === 'Escape' && isOpen) closePanel();
  }, true);

  window.addEventListener('blur', () => {
    if (isOpen) scheduleClose();
  });

  window.addEventListener('beforeunload', clearTimers, { once: true });
})();