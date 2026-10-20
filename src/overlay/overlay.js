(() => {
  if (window.top !== window) return;
  const CONTROLLER_KEY = '__arcSidebarOverlayController';
  const VERSION = 'edge-intent-v4';
  const previous = globalThis[CONTROLLER_KEY];
  if (previous?.version === VERSION && previous.active()) { previous.refresh(); return; }
  previous?.dispose();

  const SIDEBAR_MODE_KEY = 'arcSidebarMode';
  const TIMEOUT_KEY = 'arcSidebarAutohideTimeout';
  const TIMEOUTS = new Set([0, 400, 500, 600, 700, 800, 900, 1000, 1100, 1200]);
  let hideDelay = 800;
  const TRIGGER_KEY = 'arcSidebarEdgeTrigger';
  let trigger = { height: 100, offset: 0, width: 16 };
  let applyTrigger = () => {};
  // Content scripts are self-contained; match shared/edge-trigger.js bounds.
  const normalizeTrigger = value => {
    const integer = (name, fallback) => Number.isFinite(value?.[name]) ? Math.round(value[name]) : fallback;
    const height = Math.max(20, Math.min(100, integer('height', 100)));
    return { height, offset: Math.max(0, Math.min(100 - height, integer('offset', 0))), width: Math.max(10, Math.min(22, integer('width', 16))) };
  };
  const OVERLAY_MODE = 'overlay';
  const NATIVE_MODE = 'native';
  let overlayInitialized = false;
  let applyInitializedMode = null;

  let contextInvalid = false;
  let disposeOverlay = () => {};
  let canDiscardOverlay = () => true;
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

  // One owner for hover intent, pointer handoffs and both deadlines. Enter/leave
  // events can be synthesized by focus, iframe loading or the slide animation;
  // only actual pointer motion can arm an opening.
  function createEdgeHover({ state, open, close, showDelay }) {
    let point = null;
    let motionPoint = null;
    let overPanel = false;
    let pointerHeld = false;
    let needsExit = false;
    let showTimer = null;
    let hideTimer = null;
    const position = event => Number.isFinite(event?.clientX) && Number.isFinite(event?.clientY)
      ? { x: event.clientX, y: event.clientY } : null;
    const distance = (p, s) => s.side === 'left' ? p.x : s.viewportWidth - p.x;
    const inViewport = (p, s) => p && p.x >= 0 && p.x <= s.viewportWidth && p.y >= 0 && p.y < s.viewportHeight;
    // Native/overlay scrollbar events can land beyond the content viewport or
    // exactly on its outer boundary. Every event uses the same retention area.
    const inBrowser = (p, s) => p && p.x >= 0 && p.x <= s.browserWidth && p.y >= 0 && p.y < s.viewportHeight;
    const inPanel = (p, s) => inBrowser(p, s) && distance(p, s) <= s.panelWidth + s.handleWidth;
    // Small inward jitter after reaching the edge must not cancel the intent.
    const inTriggerHeight = (p, s) => p && p.y >= s.triggerTop && p.y < s.triggerBottom;
    const inOpeningZone = (p, s) => inBrowser(p, s) && inTriggerHeight(p, s) && distance(p, s) <= s.edgeWidth + 8;
    const cancelOpen = () => { if (showTimer !== null) clearTimeout(showTimer); showTimer = null; };
    const cancelClose = () => { if (hideTimer !== null) clearTimeout(hideTimer); hideTimer = null; };
    const refreshClose = () => {
      const s = state();
      if (!s.open || !s.enabled || s.locked || overPanel) { cancelClose(); return; }
      // Measure from leaving, not from the last mousemove outside the sidebar.
      if (hideTimer !== null) return;
      hideTimer = setTimeout(() => {
        hideTimer = null;
        const current = state();
        if (current.open && current.enabled && !current.locked && !overPanel) close();
      }, s.hideDelay);
    };
    return {
      cancelClose,
      reset() { cancelOpen(); cancelClose(); point = null; motionPoint = null; overPanel = false; pointerHeld = false; needsExit = false; },
      press(event) {
        cancelOpen(); cancelClose();
        pointerHeld = true;
        needsExit = inOpeningZone(position(event), state());
        point = null; motionPoint = null; overPanel = false;
      },
      release() { pointerHeld = false; point = null; motionPoint = null; },
      cancelOpening() { cancelOpen(); point = null; motionPoint = null; },
      refreshLocks: refreshClose,
      enter(event) {
        const p = position(event);
        if (event?.isTrusted && p) point = p;
        if (!state().open) return;
        overPanel = true;
        cancelClose();
      },
      leave(event) {
        const s = state();
        const p = position(event);
        if (!p || event?.isTrusted === false) return;
        point = p;
        if (!s.open) { if (!inOpeningZone(p, s)) cancelOpen(); return; }
        // A leave during animation or iframe load is not a geometric departure.
        overPanel = inPanel(p, s);
        refreshClose();
      },
      viewportLeave(event) {
        const s = state(), p = position(event);
        if (s.open && inPanel(p, s)) {
          point = p; overPanel = true; cancelClose();
          return;
        }
        // Moving into the right scrollbar preserves existing intent; it never
        // creates a new opening without preceding motion in the page.
        if (s.side === 'right' && showTimer !== null && inOpeningZone(p, s)) {
          point = p;
          return;
        }
        cancelOpen(); point = null; motionPoint = null; overPanel = false; refreshClose();
      },
      move(event) {
        if (!event.isTrusted || event.pointerType === 'touch') return;
        const next = position(event);
        if (!next) return;
        // Native scrollbar drags may not send a DOM pointerdown. Buttons on a
        // later move still block opening. Releasing never arms stationary hover.
        if (event.buttons) { this.press(event); return; }
        if (pointerHeld) {
          if (event.buttons !== 0) return;
          pointerHeld = false;
        }
        if (needsExit) {
          if (!inOpeningZone(next, state())) { needsExit = false; motionPoint = next; }
          return;
        }
        const moved = Boolean(event.movementX || event.movementY) ||
          Boolean(motionPoint && (next.x !== motionPoint.x || next.y !== motionPoint.y));
        motionPoint = next;
        point = next;
        const s = state();
        if (!s.enabled) { this.reset(); return; }
        if (s.open) {
          overPanel = inPanel(point, s);
          refreshClose();
          return;
        }
        if (!inOpeningZone(point, s)) cancelOpen();
        if (!moved || !inViewport(point, s) || !inTriggerHeight(point, s) || distance(point, s) > s.edgeWidth || showTimer !== null) return;
        showTimer = setTimeout(() => {
          showTimer = null;
          const current = state();
          if (!current.enabled || !inOpeningZone(point, current)) return;
          open();
          overPanel = state().open;
        }, showDelay);
      }
    };
  }

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
    const EDGE_WIDTH = 16;
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
        .edge { position: fixed; top: 0; right: 0; width: ${EDGE_WIDTH}px; height: 100vh; z-index: 2147483646; background: transparent; pointer-events: none; }
        .panel { position: fixed; top: 0; right: 0; width: ${DEFAULT_PANEL_WIDTH}px; height: 100vh; z-index: 2147483647; transform: translateX(100%); visibility: hidden; transition: transform 170ms cubic-bezier(.2,.8,.2,1), box-shadow 170ms ease, visibility 0s linear 170ms; background: Canvas; box-shadow: none; overflow: hidden; pointer-events: none; border-left: 1px solid color-mix(in srgb, CanvasText 10%, transparent); }
        .panel.open { transform: translateX(0); visibility: visible; transition-delay: 0s; box-shadow: -18px 0 42px rgba(0,0,0,.34); pointer-events: auto; }
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
    let isOpen = false;
    let isResizing = false;
    let cancelResize = null;
    let nativePanelOpen = false;
    let editorActive = false;
    let preservedEditor = false;
    canDiscardOverlay = () => !editorActive && !preservedEditor;
    let currentWidth = DEFAULT_PANEL_WIDTH;
    let sidebarMode = OVERLAY_MODE;
    let edgeSide = 'right';
    let suspended = false;
    let lastOpenedAt = 0;

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
      const changed = side !== edgeSide;
      if (changed) {
        cancelResize?.();
        clearTimers();
        // A side change is a relocation, not an opening/closing animation.
        panel.style.transition = 'none';
      }
      edgeSide = side;
      for (const node of [edge, panel]) {
        if (side === 'left') node.classList.add('left');
        else node.classList.remove('left');
      }
      applyWidth(currentWidth);
      if (changed) {
        // Commit the new offscreen position before restoring hover animations.
        // This layout read occurs only when Chrome's chosen side changes.
        panel.getBoundingClientRect();
        panel.style.transition = '';
      }
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

    const clearTimers = () => hover.reset();
    const cancelClose = () => hover.cancelClose();

    const forceClosePanel = () => {
      clearTimers();
      isOpen = false;
      panel.classList.remove('open');
      resizeHandle.classList.remove('open');
      notifyVisibility();
    };

    const refreshEdgeState = () => {
      // The trigger never intercepts page clicks or scrollbar grabs.
      edge.style.pointerEvents = 'none';
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
      lastOpenedAt = Date.now();
      panel.classList.add('open');
      resizeHandle.classList.add('open');
      notifyVisibility();
    };

    const closePanel = () => {
      if (isResizing || editorActive) return;
      clearTimers();
      if (!isOpen) return;
      isOpen = false;
      panel.classList.remove('open');
      resizeHandle.classList.remove('open');
      notifyVisibility();
    };

    const hover = createEdgeHover({
      state: () => ({ open: isOpen, locked: isResizing || editorActive, side: edgeSide,
        enabled: !contextInvalid && !suspended && sidebarMode === OVERLAY_MODE && !nativePanelOpen && document.visibilityState !== 'hidden',
        viewportWidth: document.documentElement.clientWidth || window.innerWidth,
        viewportHeight: document.documentElement.clientHeight || window.innerHeight, browserWidth: window.innerWidth,
        triggerTop: window.innerHeight * trigger.offset / 100,
        triggerBottom: window.innerHeight * (trigger.offset + trigger.height) / 100,
        panelWidth: currentWidth, edgeWidth: trigger.width, handleWidth: RESIZE_HANDLE_WIDTH, hideDelay }),
      open: () => { ensureHost(); openPanel(); }, close: closePanel, showDelay: SHOW_DELAY
    });

    applyTrigger = value => {
      const next = normalizeTrigger(value);
      if (JSON.stringify(next) !== JSON.stringify(trigger)) hover.cancelOpening();
      trigger = next;
      edge.style.top = `${trigger.offset}vh`;
      edge.style.height = `${trigger.height}vh`;
      edge.style.width = `${trigger.width}px`;
    };
    applyTrigger(trigger);

    // Close before the page handles the press, leaving its default action intact.
    const dismissForPointer = event => {
      if (event.isTrusted === false || event.target === host || event.composedPath?.().includes(host)) return;
      if (isOpen || isResizing) {
        preservedEditor ||= editorActive;
        cancelResize?.();
        forceClosePanel();
      }
      hover.press(event);
    };
    listen(document, 'pointerdown', dismissForPointer, { capture: true, passive: true });
    listen(window, 'pointerup', () => hover.release(), { capture: true, passive: true });
    listen(window, 'pointercancel', () => hover.release(), { capture: true, passive: true });

    const setEditorActive = open => {
      // A stale editor message cannot create an open panel by itself.
      editorActive = Boolean(open) && isOpen && iframe.hasAttribute('src');
      if (isOpen) preservedEditor = editorActive;
      if (editorActive) {
        cancelClose();
        openPanel();
      } else hover.refreshLocks();
    };

    let nativeStateRequest = 0;
    const refreshNativeState = () => {
      const request = ++nativeStateRequest;
      callChrome(() => chrome.runtime.sendMessage({ type: 'arc-native-sidepanel-is-open' }))
        .then(response => { if (!contextInvalid && request === nativeStateRequest) setNativePanelOpen(response?.open); });
    };
    refreshNativeState();
    listenChrome(chrome.runtime.onMessage, message => {
      if (message?.type === 'arc-sidebar-tab-activated') {
        // Do not let a delayed activation close a fresh, deliberate edge hover.
        if (message.activatedAt && document.visibilityState !== 'hidden' && lastOpenedAt > message.activatedAt) return;
        cancelResize?.();
        editorActive = false;
        forceClosePanel();
      }
      if (message?.type === 'arc-native-sidepanel-state') { ++nativeStateRequest; setNativePanelOpen(message.open); }
      if (message?.type === 'arc-sidebar-editor-state') setEditorActive(message.open);
    });

    listen(window, 'message', event => {
      if (event.source !== iframe.contentWindow || event.data?.type !== 'arc-sidebar-editor-state') return;
      setEditorActive(event.data.open);
    });

    // Opening requires pointer movement, never a synthesized enter on tab return.
    listen(window, 'blur', () => hover.cancelOpening());
    listen(edge, 'pointerleave', event => hover.leave(event));
    for (const surface of [panel, iframe, resizeHandle]) {
      listen(surface, 'pointerenter', event => hover.enter(event));
      listen(surface, 'pointerleave', event => {
        const target = event.relatedTarget;
        if (target === iframe || target === resizeHandle || target === panel || (target instanceof Node && panel.contains(target))) hover.enter(event);
        else hover.leave(event);
      });
    }
    listen(document, 'pointerleave', event => {
      if (event.target === document || event.target === document.documentElement) hover.viewportLeave(event);
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
        hover.leave(upEvent);
        hover.refreshLocks();
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
        preservedEditor = false;
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
      refreshNativeState();
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
        if (!editorActive && !preservedEditor) iframe.removeAttribute('src');
      }
    });
    // Capture fallback also works when a webpage's own overlay covers the edge.
    listen(document, 'pointermove', event => {
      if (event.buttons) dismissForPointer(event);
      hover.move(event);
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
    const stored = await callChrome(() => chrome.storage.local.get([SIDEBAR_MODE_KEY, TIMEOUT_KEY, TRIGGER_KEY]));
    if (contextInvalid || request !== modeRequest) return;
    try {
      const value = stored?.[TIMEOUT_KEY];
      const timeout = TIMEOUTS.has(value) && value > 0 ? value : 800;
      hideDelay = timeout;
      const mode = value === 0 ? NATIVE_MODE : stored?.[SIDEBAR_MODE_KEY] || OVERLAY_MODE;
      applyMode(mode);
      applyTrigger(stored?.[TRIGGER_KEY]);
    } catch (error) { handleApiError(error); }
  };
  listen(window, 'focus', refreshMode);
  listen(document, 'visibilitychange', () => {
    if (document.visibilityState === 'visible') refreshMode();
  });
  globalThis[CONTROLLER_KEY] = { version: VERSION, active: () => !contextInvalid && Boolean(chrome.runtime.id), refresh: refreshMode, dispose: stopInvalidContext,
    prepareDiscard: () => { if (!canDiscardOverlay()) return false; stopInvalidContext(); return true; } };
  listenChrome(chrome.runtime.onMessage, (message, _sender, respond) => {
    if (message?.type === 'arc-sidebar-apply-mode' && !contextInvalid) {
      ++modeRequest;
      hideDelay = TIMEOUTS.has(message.timeout) && message.timeout > 0 ? message.timeout : 800;
      applyMode(message.mode);
      applyTrigger(message.trigger);
      respond({ version: VERSION });
      return;
    }
    if (message?.type === 'arc-sidebar-refresh-mode' || message?.type === 'arc-sidebar-tab-activated') refreshMode();
  });
  refreshMode();
})();
