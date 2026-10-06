(() => {
  if (window.top !== window) return;
  if (document.documentElement.dataset.arcSidebarOverlayInjected === '1') return;
  document.documentElement.dataset.arcSidebarOverlayInjected = '1';

  const DEFAULT_PANEL_WIDTH = 390;
  const MIN_PANEL_WIDTH = 280;
  const MAX_PANEL_WIDTH = 720;
  const WIDTH_STORAGE_KEY = 'arcSidebarOverlayWidth';
  const EDGE_WIDTH = 7;
  const RESIZE_HANDLE_WIDTH = 14;
  const SHOW_DELAY = 80;
  const HIDE_DELAY = 800;
  const themeMedia = window.matchMedia('(prefers-color-scheme: dark)');
  const currentTheme = () => themeMedia.matches ? 'dark' : 'light';

  const clampWidth = value => {
    const viewportMax = Math.max(MIN_PANEL_WIDTH, Math.min(MAX_PANEL_WIDTH, window.innerWidth - 48));
    const width = Number(value) || DEFAULT_PANEL_WIDTH;
    return Math.max(MIN_PANEL_WIDTH, Math.min(width, viewportMax));
  };

  const host = document.createElement('div');
  host.id = 'arc-sidebar-overlay-host';
  host.style.all = 'initial';
  host.style.colorScheme = currentTheme();
  document.documentElement.append(host);

  const shadow = host.attachShadow({ mode: 'closed' });
  const sidebarUrl = new URL(chrome.runtime.getURL('src/sidepanel/index.html'));
  sidebarUrl.searchParams.set('overlay', '1');
  sidebarUrl.searchParams.set('theme', currentTheme());

  shadow.innerHTML = `
    <style>
      :host {
        all: initial;
        color-scheme: light dark;
      }
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
        background: Canvas;
        box-shadow: none;
        overflow: hidden;
        pointer-events: none;
        border-left: 1px solid color-mix(in srgb, CanvasText 10%, transparent);
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
        position: fixed;
        top: 0;
        width: ${RESIZE_HANDLE_WIDTH}px;
        height: 100vh;
        z-index: 2147483647;
        cursor: ew-resize;
        background: transparent;
        touch-action: none;
        pointer-events: none;
        opacity: 0;
      }
      .resize-handle.open {
        pointer-events: auto;
        opacity: 1;
      }
      .resize-handle::after {
        content: '';
        position: absolute;
        top: 0;
        bottom: 0;
        left: 50%;
        width: 2px;
        transform: translateX(-1px);
        background: transparent;
        transition: background 120ms ease;
      }
      .resize-handle:hover::after,
      .resize-handle.resizing::after {
        background: color-mix(in srgb, CanvasText 26%, transparent);
      }
      iframe {
        width: 100%;
        height: 100%;
        border: 0;
        display: block;
        background: Canvas;
      }
    </style>
    <div class="edge" aria-hidden="true"></div>
    <div class="resize-handle" title="Drag to resize sidebar" aria-hidden="true"></div>
    <div class="panel" role="complementary" aria-label="Arc Sidebar">
      <iframe title="Arc Sidebar" src="${sidebarUrl.href}"></iframe>
    </div>`;

  const edge = shadow.querySelector('.edge');
  const panel = shadow.querySelector('.panel');
  const iframe = shadow.querySelector('iframe');
  const resizeHandle = shadow.querySelector('.resize-handle');
  let showTimer = null;
  let hideTimer = null;
  let isOpen = false;
  let isResizing = false;
  let nativePanelOpen = false;
  let currentWidth = DEFAULT_PANEL_WIDTH;

  const sendTheme = () => {
    const theme = currentTheme();
    host.style.colorScheme = theme;
    panel.style.colorScheme = theme;
    iframe.style.colorScheme = theme;
    try {
      iframe.contentWindow?.postMessage({ type: 'arc-sidebar-theme', theme }, '*');
    } catch {}
  };

  iframe.addEventListener('load', sendTheme);
  themeMedia.addEventListener('change', sendTheme);
  sendTheme();

  const applyWidth = value => {
    currentWidth = clampWidth(value);
    panel.style.width = `${currentWidth}px`;
    resizeHandle.style.right = `${currentWidth - (RESIZE_HANDLE_WIDTH / 2)}px`;
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

  const cancelClose = () => {
    if (hideTimer) clearTimeout(hideTimer);
    hideTimer = null;
  };

  const forceClosePanel = () => {
    clearTimers();
    isOpen = false;
    panel.classList.remove('open');
    resizeHandle.classList.remove('open');
  };

  const setNativePanelOpen = open => {
    nativePanelOpen = Boolean(open);
    edge.style.pointerEvents = nativePanelOpen ? 'none' : 'auto';
    if (nativePanelOpen) forceClosePanel();
  };

  const openPanel = () => {
    if (nativePanelOpen) return;
    cancelClose();
    sendTheme();
    if (isOpen) return;
    isOpen = true;
    panel.classList.add('open');
    resizeHandle.classList.add('open');
  };

  const closePanel = () => {
    if (isResizing) return;
    if (showTimer) clearTimeout(showTimer);
    showTimer = null;
    if (!isOpen) return;
    isOpen = false;
    panel.classList.remove('open');
    resizeHandle.classList.remove('open');
  };

  const scheduleOpen = () => {
    if (nativePanelOpen) return;
    cancelClose();
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
    cancelClose();
    hideTimer = setTimeout(() => {
      hideTimer = null;
      closePanel();
    }, HIDE_DELAY);
  };

  chrome.runtime.sendMessage({ type: 'arc-native-sidepanel-is-open' })
    .then(response => setNativePanelOpen(response?.open))
    .catch(() => {});

  chrome.runtime.onMessage.addListener(message => {
    if (message?.type === 'arc-native-sidepanel-state') {
      setNativePanelOpen(message.open);
    }
  });

  edge.addEventListener('mouseenter', scheduleOpen);
  edge.addEventListener('mouseleave', () => {
    if (!isOpen && showTimer) {
      clearTimeout(showTimer);
      showTimer = null;
    }
  });

  panel.addEventListener('mouseenter', cancelClose);
  iframe.addEventListener('mouseenter', cancelClose);
  iframe.addEventListener('pointerenter', cancelClose);
  resizeHandle.addEventListener('mouseenter', cancelClose);

  panel.addEventListener('mouseleave', event => {
    const target = event.relatedTarget;
    if (target === iframe || target === resizeHandle || (target instanceof Node && panel.contains(target))) return;
    scheduleClose();
  });
  iframe.addEventListener('mouseleave', event => {
    if (event.relatedTarget === resizeHandle) return;
    scheduleClose();
  });
  resizeHandle.addEventListener('mouseleave', event => {
    if (isResizing || event.relatedTarget === panel || event.relatedTarget === iframe) return;
    scheduleClose();
  });

  resizeHandle.addEventListener('pointerdown', event => {
    if (nativePanelOpen || event.button !== 0) return;
    event.preventDefault();
    event.stopPropagation();

    isResizing = true;
    clearTimers();
    openPanel();
    panel.classList.add('resizing');
    resizeHandle.classList.add('resizing');
    resizeHandle.setPointerCapture(event.pointerId);

    const startX = event.clientX;
    const startWidth = currentWidth;

    const onPointerMove = moveEvent => {
      if (!isResizing) return;
      applyWidth(startWidth + (startX - moveEvent.clientX));
    };

    const finishResize = async upEvent => {
      if (!isResizing) return;
      isResizing = false;
      panel.classList.remove('resizing');
      resizeHandle.classList.remove('resizing');
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
  window.addEventListener('beforeunload', clearTimers, { once: true });
})();
