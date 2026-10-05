(() => {
  if (window.top !== window) return;
  if (document.documentElement.dataset.arcSidebarOverlayInjected === '1') return;
  document.documentElement.dataset.arcSidebarOverlayInjected = '1';

  const DEFAULT_PANEL_WIDTH = 390;
  const MIN_PANEL_WIDTH = 280;
  const MAX_PANEL_WIDTH = 720;
  const WIDTH_STORAGE_KEY = 'arcSidebarOverlayWidth';
  const EDGE_WIDTH = 7;
  const RESIZE_HANDLE_WIDTH = 7;
  const SHOW_DELAY = 80;
  const HIDE_DELAY = 320;

  const clampWidth = value => {
    const viewportMax = Math.max(MIN_PANEL_WIDTH, Math.min(MAX_PANEL_WIDTH, window.innerWidth - 48));
    const width = Number(value) || DEFAULT_PANEL_WIDTH;
    return Math.max(MIN_PANEL_WIDTH, Math.min(width, viewportMax));
  };

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
        width: ${DEFAULT_PANEL_WIDTH}px;
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
      .panel.resizing {
        transition: none;
        user-select: none;
      }
      .resize-handle {
        position: absolute;
        top: 0;
        left: 0;
        width: ${RESIZE_HANDLE_WIDTH}px;
        height: 100%;
        z-index: 3;
        cursor: ew-resize;
        background: transparent;
        touch-action: none;
      }
      .resize-handle::after {
        content: '';
        position: absolute;
        top: 0;
        bottom: 0;
        left: 0;
        width: 2px;
        background: rgba(255,255,255,0);
        transition: background 120ms ease;
      }
      .resize-handle:hover::after,
      .panel.resizing .resize-handle::after {
        background: rgba(255,255,255,.26);
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
      <div class="resize-handle" title="Drag to resize sidebar" aria-hidden="true"></div>
      <iframe title="Arc Sidebar" src="${chrome.runtime.getURL('src/sidepanel/index.html?overlay=1')}"></iframe>
    </div>`;

  const edge = shadow.querySelector('.edge');
  const panel = shadow.querySelector('.panel');
  const resizeHandle = shadow.querySelector('.resize-handle');
  let showTimer = null;
  let hideTimer = null;
  let isOpen = false;
  let isResizing = false;
  let currentWidth = DEFAULT_PANEL_WIDTH;

  const applyWidth = value => {
    currentWidth = clampWidth(value);
    panel.style.width = `${currentWidth}px`;
  };

  chrome.storage.local.get(WIDTH_STORAGE_KEY).then(stored => {
    applyWidth(stored[WIDTH_STORAGE_KEY]);
  }).catch(() => applyWidth(DEFAULT_PANEL_WIDTH));

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'local' && changes[WIDTH_STORAGE_KEY] && !isResizing) {
      applyWidth(changes[WIDTH_STORAGE_KEY].newValue);
    }
  });

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
    if (isResizing) return;
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
    if (isResizing) return;
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

  resizeHandle.addEventListener('pointerdown', event => {
    if (event.button !== 0) return;
    event.preventDefault();
    event.stopPropagation();

    openPanel();
    isResizing = true;
    clearTimers();
    panel.classList.add('resizing');
    resizeHandle.setPointerCapture(event.pointerId);

    const startX = event.clientX;
    const startWidth = currentWidth;

    const onPointerMove = moveEvent => {
      if (!isResizing) return;
      const nextWidth = startWidth + (startX - moveEvent.clientX);
      applyWidth(nextWidth);
    };

    const finishResize = async upEvent => {
      if (!isResizing) return;
      isResizing = false;
      panel.classList.remove('resizing');
      resizeHandle.removeEventListener('pointermove', onPointerMove);
      resizeHandle.removeEventListener('pointerup', finishResize);
      resizeHandle.removeEventListener('pointercancel', finishResize);
      try {
        if (resizeHandle.hasPointerCapture(upEvent.pointerId)) {
          resizeHandle.releasePointerCapture(upEvent.pointerId);
        }
      } catch {}
      await chrome.storage.local.set({ [WIDTH_STORAGE_KEY]: currentWidth });
    };

    resizeHandle.addEventListener('pointermove', onPointerMove);
    resizeHandle.addEventListener('pointerup', finishResize);
    resizeHandle.addEventListener('pointercancel', finishResize);
  });

  window.addEventListener('resize', () => applyWidth(currentWidth));

  document.addEventListener('keydown', event => {
    if (event.key === 'Escape' && isOpen) closePanel();
  }, true);

  window.addEventListener('blur', () => {
    if (isOpen) scheduleClose();
  });

  window.addEventListener('beforeunload', clearTimers, { once: true });
})();