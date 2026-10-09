(() => {
  if (window.top !== window) return;
  const CONTROLLER_KEY = '__arcSidebarOverlayController';
  const VERSION = 'focus-injection-v1';
  const previous = globalThis[CONTROLLER_KEY];
  if (previous?.version === VERSION && previous.active()) { previous.refresh(); return; }
  previous?.dispose();

  const SIDEBAR_MODE_KEY = 'arcSidebarMode';
  const TIMEOUT_KEY = 'arcSidebarAutohideTimeout';
  const TIMEOUTS = new Set([0, 500, 600, 700, 800, 900, 1000, 1100]);
  let hideDelay = 800;
  const OVERLAY_MODE = 'overlay';
  const NATIVE_MODE = 'native';
  let overlayInitialized = false;
  let applyInitializedMode = null;

  let contextInvalid = false;
  let disposeOverlay = () => {};
  const listeners = [];
  const listen = (target, event, callback, options) => {
    target.addEventListener(event, callback, options);
    listeners.push(() => target.removeEventListener?.(event, callback, options));
  };
  const listenChrome = (event, callback) => {
    try {
      event.addListener(callback);
      listeners.push(() => event.removeListener?.(callback));
    } catch (error) { handleApiError(error); }
  };
  const stopInvalidContext = () => {
    if (contextInvalid) return;
    contextInvalid = true;
    disposeOverlay();
    for (const remove of listeners.splice(0)) { try { remove(); } catch {} }
  };
  const handleApiError = error => {
    if (/extension context invalidated/i.test(error?.message || String(error))) stopInvalidContext();
  };
  // Chrome can throw before returning a Promise after extension reload.
  const callChrome = async operation => {
    if (contextInvalid) return undefined;
    try {
      if (!chrome.runtime.id) { stopInvalidContext(); return undefined; }
      return await operation();
    }
    catch (error) { handleApiError(error); return undefined; }
  };

  function initOverlay() {
    if (contextInvalid) return;
    if (overlayInitialized) {
      applyInitializedMode?.(OVERLAY_MODE);
      return;
    }
    overlayInitialized = true;

    const DEFAULT_PANEL_WIDTH = 390;
    const MIN_PANEL_WIDTH = 120;
    const MAX_PANEL_WIDTH = 720;
    const WIDTH_STORAGE_KEY = 'arcSidebarOverlayWidth';
    const EDGE_WIDTH = 7;
    const RESIZE_HANDLE_WIDTH = 14;
    const SHOW_DELAY = 80;
    const themeMedia = window.matchMedia('(prefers-color-scheme: dark)');
    const currentTheme = () => themeMedia.matches ? 'dark' : 'light';

    const clampWidth = value => {
      const viewportMax = Math.max(MIN_PANEL_WIDTH, Math.min(MAX_PANEL_WIDTH, window.innerWidth - 48));
      const width = Number(value) || DEFAULT_PANEL_WIDTH;
      return Math.max(MIN_PANEL_WIDTH, Math.min(width, viewportMax));
    };

    document.getElementById?.('arc-sidebar-overlay-host')?.remove();
    const host = document.createElement('div');
    disposeOverlay = () => host.remove?.();
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
        :host { all: initial; color-scheme: light dark; }
        .edge { position: fixed; top: 0; right: 0; width: ${EDGE_WIDTH}px; height: 100vh; z-index: 2147483646; background: transparent; pointer-events: auto; }
        .panel { position: fixed; top: 0; right: 0; width: ${DEFAULT_PANEL_WIDTH}px; height: 100vh; z-index: 2147483647; transform: translateX(100%); transition: transform 170ms cubic-bezier(.2,.8,.2,1), box-shadow 170ms ease; background: Canvas; box-shadow: none; overflow: hidden; pointer-events: none; border-left: 1px solid color-mix(in srgb, CanvasText 10%, transparent); }
        .panel.open { transform: translateX(0); box-shadow: -18px 0 42px rgba(0,0,0,.34); pointer-events: auto; }
        .edge.left { left: 0; right: auto; }
        .panel.left { left: 0; right: auto; transform: translateX(-100%); border-left: 0; border-right: 1px solid color-mix(in srgb, CanvasText 10%, transparent); }
        .panel.left.open { transform: translateX(0); box-shadow: 18px 0 42px rgba(0,0,0,.34); }
        .panel.resizing { transition: none; user-select: none; }
        .resize-handle { position: fixed; top: 0; width: ${RESIZE_HANDLE_WIDTH}px; height: 100vh; z-index: 2147483647; cursor: ew-resize; background: transparent; touch-action: none; pointer-events: none; opacity: 0; }
        .resize-handle.open { pointer-events: auto; opacity: 1; }
        .resize-handle::after { content: ''; position: absolute; top: 0; bottom: 0; left: 50%; width: 2px; transform: translateX(-1px); background: transparent; transition: background 120ms ease; }
        .resize-handle:hover::after, .resize-handle.resizing::after { background: color-mix(in srgb, CanvasText 26%, transparent); }
        iframe { width: 100%; height: 100%; border: 0; display: block; background: Canvas; }
      </style>
      <div class="edge" aria-hidden="true"></div>
      <div class="resize-handle" title="Drag to resize sidebar" aria-hidden="true"></div>
      <div class="panel" role="complementary" aria-label="Arc Side of the Chrome"><iframe title="Arc Side of the Chrome" data-sidebar-src="${sidebarUrl.href}"></iframe></div>`;

    const edge = shadow.querySelector('.edge');
    const panel = shadow.querySelector('.panel');
    const iframe = shadow.querySelector('iframe');
    const resizeHandle = shadow.querySelector('.resize-handle');
    let showTimer = null;
    let hideTimer = null;
    let isOpen = false;
    let isResizing = false;
    let cancelResize = null;
    let nativePanelOpen = false;
    let editorActive = false;
    let currentWidth = DEFAULT_PANEL_WIDTH;
    let sidebarMode = OVERLAY_MODE;
    let edgeSide = 'right';

    const sendTheme = () => {
      const theme = currentTheme();
      host.style.colorScheme = theme;
      panel.style.colorScheme = theme;
      iframe.style.colorScheme = theme;
      try { iframe.contentWindow?.postMessage({ type: 'arc-sidebar-theme', theme }, '*'); } catch {}
    };

    const notifyVisibility = () => {
      try { iframe.contentWindow?.postMessage({ type: 'arc-sidebar-overlay-visibility', open: isOpen && sidebarMode === OVERLAY_MODE && !nativePanelOpen && document.visibilityState !== 'hidden' }, '*'); } catch {}
    };
    const ensureSidebarLoaded = () => {
      if (!iframe.hasAttribute('src')) iframe.src = sidebarUrl.href;
    };
    listen(iframe, 'load', () => { sendTheme(); notifyVisibility(); });
    listen(themeMedia, 'change', sendTheme);
    sendTheme();

    const applyWidth = value => {
      currentWidth = clampWidth(value);
      panel.style.width = `${currentWidth}px`;
      resizeHandle.style.left = edgeSide === 'left' ? `${currentWidth - (RESIZE_HANDLE_WIDTH / 2)}px` : 'auto';
      resizeHandle.style.right = edgeSide === 'right' ? `${currentWidth - (RESIZE_HANDLE_WIDTH / 2)}px` : 'auto';
    };

    const applyEdgeSide = value => {
      const side = value === 'left' ? 'left' : 'right';
      if (side !== edgeSide) {
        cancelResize?.();
        clearTimers();
      }
      edgeSide = side;
      for (const node of [edge, panel]) {
        if (side === 'left') node.classList.add('left');
        else node.classList.remove('left');
      }
      applyWidth(currentWidth);
    };
    let layoutRequest = 0;
    const refreshLayout = async () => {
      const request = ++layoutRequest;
      try {
        const layout = await callChrome(() => chrome.runtime.sendMessage({ type: 'arc-sidebar-panel-layout' }));
        if (!contextInvalid && request === layoutRequest && (layout?.side === 'left' || layout?.side === 'right')) applyEdgeSide(layout.side);
      } catch {}
    };
    refreshLayout();
    callChrome(() => chrome.storage.local.get(WIDTH_STORAGE_KEY)).then(stored => { if (!contextInvalid) applyWidth(stored?.[WIDTH_STORAGE_KEY]); });
    listenChrome(chrome.storage.onChanged, (changes, area) => {
      if (area === 'local' && changes[WIDTH_STORAGE_KEY] && !isResizing) applyWidth(changes[WIDTH_STORAGE_KEY].newValue);
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
      notifyVisibility();
    };

    const refreshEdgeState = () => {
      edge.style.pointerEvents = sidebarMode === OVERLAY_MODE && !nativePanelOpen ? 'auto' : 'none';
    };

    applyInitializedMode = mode => {
      sidebarMode = mode === NATIVE_MODE ? NATIVE_MODE : OVERLAY_MODE;
      const overlayActive = sidebarMode === OVERLAY_MODE;
      host.style.setProperty('display', overlayActive ? 'block' : 'none', 'important');
      if (!overlayActive) forceClosePanel();
      refreshEdgeState();
    };

    const setNativePanelOpen = open => {
      nativePanelOpen = Boolean(open);
      refreshEdgeState();
      if (nativePanelOpen) forceClosePanel();
    };

    const openPanel = () => {
      if (contextInvalid || sidebarMode !== OVERLAY_MODE || nativePanelOpen || document.visibilityState === 'hidden') return;
      cancelClose();
      ensureSidebarLoaded();
      sendTheme();
      if (isOpen) return;
      isOpen = true;
      panel.classList.add('open');
      resizeHandle.classList.add('open');
      notifyVisibility();
    };

    const closePanel = () => {
      if (isResizing || editorActive) return;
      if (showTimer) clearTimeout(showTimer);
      showTimer = null;
      if (!isOpen) return;
      isOpen = false;
      panel.classList.remove('open');
      resizeHandle.classList.remove('open');
      notifyVisibility();
    };

    const scheduleOpen = () => {
      if (contextInvalid || sidebarMode !== OVERLAY_MODE || nativePanelOpen || document.visibilityState === 'hidden') return;
      cancelClose();
      if (isOpen || showTimer) return;
      showTimer = setTimeout(() => {
        showTimer = null;
        openPanel();
      }, SHOW_DELAY);
    };

    const scheduleClose = () => {
      if (isResizing || editorActive) return;
      if (showTimer) clearTimeout(showTimer);
      showTimer = null;
      if (!isOpen) return;
      cancelClose();
      hideTimer = setTimeout(() => {
        hideTimer = null;
        closePanel();
      }, hideDelay);
    };

    const setEditorActive = open => {
      // A stale editor message cannot create an open panel by itself.
      editorActive = Boolean(open) && isOpen && iframe.hasAttribute('src');
      if (editorActive) {
        cancelClose();
        openPanel();
      } else if (!panel.matches?.(':hover') && !resizeHandle.matches?.(':hover')) {
        scheduleClose();
      }
    };

    callChrome(() => chrome.runtime.sendMessage({ type: 'arc-native-sidepanel-is-open' })).then(response => { if (!contextInvalid) setNativePanelOpen(response?.open); });
    listenChrome(chrome.runtime.onMessage, message => {
      if (message?.type === 'arc-sidebar-tab-activated') {
        cancelResize?.();
        editorActive = false;
        forceClosePanel();
      }
      if (message?.type === 'arc-native-sidepanel-state') setNativePanelOpen(message.open);
      if (message?.type === 'arc-sidebar-editor-state') setEditorActive(message.open);
    });

    listen(window, 'message', event => {
      if (event.source !== iframe.contentWindow || event.data?.type !== 'arc-sidebar-editor-state') return;
      setEditorActive(event.data.open);
    });

    // Opening requires pointer movement, never a synthesized enter on tab return.
    listen(window, 'blur', () => {
      if (showTimer) clearTimeout(showTimer);
      showTimer = null;
    });
    listen(edge, 'mouseleave', () => {
      if (!isOpen && showTimer) {
        clearTimeout(showTimer);
        showTimer = null;
      }
    });

    listen(panel, 'mouseenter', cancelClose);
    listen(iframe, 'mouseenter', cancelClose);
    listen(iframe, 'pointerenter', cancelClose);
    listen(resizeHandle, 'mouseenter', cancelClose);

    listen(panel, 'mouseleave', event => {
      const target = event.relatedTarget;
      if (target === iframe || target === resizeHandle || (target instanceof Node && panel.contains(target))) return;
      scheduleClose();
    });
    listen(iframe, 'mouseleave', event => {
      if (event.relatedTarget === resizeHandle) return;
      scheduleClose();
    });
    listen(resizeHandle, 'mouseleave', event => {
      if (isResizing || event.relatedTarget === panel || event.relatedTarget === iframe) return;
      scheduleClose();
    });

    listen(resizeHandle, 'pointerdown', event => {
      if (sidebarMode !== OVERLAY_MODE || nativePanelOpen || event.button !== 0) return;
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
        applyWidth(startWidth + (edgeSide === 'left' ? moveEvent.clientX - startX : startX - moveEvent.clientX));
      };
      const finishResize = async upEvent => {
        if (!isResizing) return;
        isResizing = false;
        cancelResize = null;
        panel.classList.remove('resizing');
        resizeHandle.classList.remove('resizing');
        resizeHandle.removeEventListener('pointermove', onPointerMove);
        resizeHandle.removeEventListener('pointerup', finishResize);
        resizeHandle.removeEventListener('pointercancel', finishResize);
        try { if (resizeHandle.hasPointerCapture(upEvent.pointerId)) resizeHandle.releasePointerCapture(upEvent.pointerId); } catch {}
        await callChrome(() => chrome.storage.local.set({ [WIDTH_STORAGE_KEY]: currentWidth }));
      };
      cancelResize = () => { finishResize({ pointerId: event.pointerId }).catch(() => {}); };
      resizeHandle.addEventListener('pointermove', onPointerMove);
      resizeHandle.addEventListener('pointerup', finishResize);
      resizeHandle.addEventListener('pointercancel', finishResize);
    });

    // SPA renderers can remove extension-owned nodes without destroying this
    // content-script context. Restore the SAME host and listeners, not another
    // overlay instance. Observe only document/root children, not the page subtree.
    let observedRoot = null;
    let suspended = false;
    let repairTimer = null;
    let styleSignature = '';
    let normalizedHostStyle = '';
    const observeHost = () => hostObserver.observe(host, { attributes: true, attributeFilter: ['style', 'hidden', 'id'] });
    // Yield to the page's event loop; never repair recursively in the mutation
    // microtask checkpoint, even if the page continuously changes this host.
    const scheduleHostRepair = () => {
      if (suspended || repairTimer !== null) return;
      repairTimer = setTimeout(() => {
        repairTimer = null;
        ensureHost();
      }, 0);
    };
    const rootObserver = new MutationObserver(scheduleHostRepair);
    const documentObserver = new MutationObserver(scheduleHostRepair);
    const hostObserver = new MutationObserver(scheduleHostRepair);
    const ensureHost = () => {
      if (suspended || contextInvalid) return;
      const root = document.documentElement;
      if (!root) return;
      if (observedRoot !== root) {
        rootObserver.disconnect();
        observedRoot = root;
        rootObserver.observe(root, { childList: true });
      }
      if (host.parentNode !== root) {
        // Reconnecting an iframe creates a new browsing context; discard stale
        // editor/resize locks so the edge cannot stay disabled indefinitely.
        editorActive = false;
        isResizing = false;
        panel.classList.remove('resizing');
        resizeHandle.classList.remove('resizing');
        forceClosePanel();
        root.append(host);
      }
      // Disconnect while changing observed attributes. CSS shorthands such as
      // `all` / `overflow` can serialize differently from the input and used to
      // trigger an endless observer -> style write -> observer microtask chain.
      hostObserver.disconnect();
      try {
        if (host.id !== 'arc-sidebar-overlay-host') host.id = 'arc-sidebar-overlay-host';
        const signature = [sidebarMode, currentTheme()].join(':');
        if (styleSignature !== signature || host.style.cssText !== normalizedHostStyle) {
          host.style.cssText = `all: initial !important; display: ${sidebarMode === OVERLAY_MODE ? 'block' : 'none'} !important; position: fixed !important; top: 0px !important; right: 0px !important; width: 0px !important; height: 0px !important; overflow: visible !important; visibility: visible !important; opacity: 1 !important; transform: none !important; pointer-events: auto !important; z-index: 2147483647 !important; color-scheme: ${currentTheme()} !important;`;
          styleSignature = signature;
          normalizedHostStyle = host.style.cssText;
        }
        if (host.hidden) host.hidden = false;
      } finally {
        if (!suspended) observeHost();
      }
    };
    disposeOverlay = () => {
      suspended = true;
      // Cancellation of a resize must never write through an invalid context.
      cancelResize?.();
      editorActive = false;
      forceClosePanel();
      if (repairTimer !== null) clearTimeout(repairTimer);
      repairTimer = null;
      rootObserver.disconnect();
      documentObserver.disconnect();
      hostObserver.disconnect();
      iframe.removeAttribute('src');
      host.remove?.();
    };
    const resume = () => {
      if (contextInvalid) return;
      suspended = false;
      documentObserver.observe(document, { childList: true });
      ensureHost();
      callChrome(() => chrome.runtime.sendMessage({ type: 'arc-native-sidepanel-is-open' }))
        .then(response => { if (!contextInvalid) setNativePanelOpen(response?.open); });
    };
    listen(window, 'pagehide', () => {
      cancelResize?.();
      forceClosePanel();
      suspended = true;
      if (repairTimer !== null) clearTimeout(repairTimer);
      repairTimer = null;
      clearTimers();
      rootObserver.disconnect();
      documentObserver.disconnect();
      hostObserver.disconnect();
      observedRoot = null;
    });
    listen(window, 'pageshow', resume);
    listen(window, 'focus', () => { refreshLayout(); resume(); notifyVisibility(); });
    listen(document, 'visibilitychange', () => {
      if (document.visibilityState === 'visible') { refreshLayout(); resume(); notifyVisibility(); }
      else {
        cancelResize?.();
        forceClosePanel();
        // Keep unsaved editor contents, but never its visible/open state.
        if (!editorActive) iframe.removeAttribute('src');
      }
    });
    // Capture fallback also works when a webpage's own overlay covers the edge.
    listen(document, 'pointermove', event => {
      if (sidebarMode !== OVERLAY_MODE || nativePanelOpen || suspended) return;
      const distanceFromEdge = edgeSide === 'left' ? event.clientX : window.innerWidth - event.clientX;
      if (distanceFromEdge >= 0 && distanceFromEdge <= EDGE_WIDTH && event.isTrusted && (event.movementX !== 0 || event.movementY !== 0)) {
        ensureHost();
        scheduleOpen();
      } else if (isOpen && distanceFromEdge > currentWidth + RESIZE_HANDLE_WIDTH) {
        scheduleClose();
      } else if (!isOpen && showTimer) {
        clearTimeout(showTimer);
        showTimer = null;
      }
    }, { capture: true, passive: true });
    resume();

    listen(window, 'resize', () => applyWidth(currentWidth));
    listen(document, 'keydown', event => {
      if (event.key === 'Escape' && isOpen && !editorActive) closePanel();
    }, true);
    listen(window, 'beforeunload', clearTimers, { once: true });
  }

  const applyMode = mode => {
    if (contextInvalid) return;
    const normalized = mode === NATIVE_MODE ? NATIVE_MODE : OVERLAY_MODE;
    if (normalized === OVERLAY_MODE) initOverlay();
    else if (overlayInitialized) applyInitializedMode?.(NATIVE_MODE);
  };

  let modeRequest = 0;
  const refreshMode = async () => {
    const request = ++modeRequest;
    const stored = await callChrome(() => chrome.storage.local.get([SIDEBAR_MODE_KEY, TIMEOUT_KEY]));
    if (contextInvalid || request !== modeRequest) return;
    try {
      const value = stored?.[TIMEOUT_KEY];
      const timeout = TIMEOUTS.has(value) && value > 0 ? value : 800;
      hideDelay = timeout;
      const mode = value === 0 ? NATIVE_MODE : stored?.[SIDEBAR_MODE_KEY] || OVERLAY_MODE;
      applyMode(mode);
    } catch (error) { handleApiError(error); }
  };
  listen(window, 'focus', refreshMode);
  listen(document, 'visibilitychange', () => {
    if (document.visibilityState === 'visible') refreshMode();
  });
  globalThis[CONTROLLER_KEY] = { version: VERSION, active: () => !contextInvalid && Boolean(chrome.runtime.id), refresh: refreshMode, dispose: stopInvalidContext };
  listenChrome(chrome.runtime.onMessage, (message, _sender, respond) => {
    if (message?.type === 'arc-sidebar-apply-mode' && !contextInvalid) {
      ++modeRequest;
      hideDelay = TIMEOUTS.has(message.timeout) && message.timeout > 0 ? message.timeout : 800;
      applyMode(message.mode);
      respond({ version: VERSION });
      return;
    }
    if (message?.type === 'arc-sidebar-refresh-mode' || message?.type === 'arc-sidebar-tab-activated') refreshMode();
  });
  refreshMode();
})();
