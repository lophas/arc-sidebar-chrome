(() => {
  if (window.top !== window || !navigator.mediaSession || !document.pictureInPictureEnabled) return;
  const KEY = '__arcSidebarAutoPip';
  const VERSION = 9;
  if (globalThis[KEY]?.version === VERSION) return;
  globalThis[KEY]?.dispose();
  const session = navigator.mediaSession;
  const originalSetter = session.setActionHandler;
  let siteHandler = null;
  let enabled = false;
  let ownedVideo = null;
  let observedVideo = null;
  let returnVideo = null;
  let ownedPortal = null;
  let opening = false;
  let portalOpening = false;
  let dismissed = false;
  let disposed = false;
  let lastError = null;
  let lastAction = null;
  let lastSkip = null;
  let sourceActive = null;
  let activationEpoch = 0;
  let requestStartedAt = 0;
  let lastActivationAt = 0;
  let lastAutomaticOpenAt = 0;
  const recentEvents = [];
  const trace = event => {
    if (event === 'video-player-opened' || event === 'document-player-opened') lastAutomaticOpenAt = Date.now();
    recentEvents.push({ event, at: Date.now(), sourceActive });
    if (recentEvents.length > 12) recentEvents.shift();
  };
  const hasFocus = () => document.hasFocus?.() === true;
  // macOS can keep an automatic Document PiP window alive but hidden. Use
  // Chrome's native video window there; the live player stays in its page.
  const preferNativeVideo = /mac/i.test(navigator.userAgentData?.platform || navigator.platform || '');
  const resizePlayer = player => {
    const resize = () => {
      if (player.ownerDocument !== document) return;
      try { player.setSize?.(); } catch {}
    };
    resize();
    requestAnimationFrame(resize);
  };
  const setHandler = handler => originalSetter.call(session, 'enterpictureinpicture', handler);
  // Scan only when selecting a player, not on a timer or every DOM mutation.
  // One top-frame Media Session handles ordinary, shadow and same-origin
  // embedded videos. Cross-origin/sandboxed frames remain browser boundaries.
  const mediaRoots = () => {
    const roots = new Set();
    const visit = root => {
      if (!root || roots.has(root)) return;
      roots.add(root);
      for (const element of root.querySelectorAll('*')) {
        if (element.shadowRoot) visit(element.shadowRoot);
        if (element.localName === 'iframe' || element.localName === 'frame') {
          try { visit(element.contentDocument); } catch {}
        }
      }
    };
    visit(document);
    return [...roots];
  };
  const videosIn = roots => [...new Set(roots.flatMap(root => [...root.querySelectorAll('video')]))];
  const videoDocument = video => video.ownerDocument || document;
  const inNativePip = video => video && (video.getRootNode?.().pictureInPictureElement || videoDocument(video).pictureInPictureElement) === video;
  const playingVideo = (roots = mediaRoots()) => videosIn(roots)
    .filter(video => !video.paused && !video.ended && !video.muted && video.volume > 0 && video.readyState >= 2 && video.videoWidth > 0 && !video.disablePictureInPicture && typeof video.requestPictureInPicture === 'function' && videoDocument(video).pictureInPictureEnabled !== false)
    .sort((a, b) => b.videoWidth * b.videoHeight - a.videoWidth * a.videoHeight)[0];
  const watchVideo = video => {
    observedVideo?.removeEventListener?.('leavepictureinpicture', onLeave);
    observedVideo = video;
    // An iframe/shadow event does not reach the top document reliably.
    observedVideo?.addEventListener?.('leavepictureinpicture', onLeave);
  };
  const restorePlayer = video => {
    if (!video) return;
    // Native leave events and YouTube's visibility handlers can arrive in either
    // order. Let them finish before correcting a stale player-side PiP state.
    requestAnimationFrame(() => {
      if (document.visibilityState !== 'visible' || inNativePip(video) || window.documentPictureInPicture?.window || !video.isConnected) return;
      const player = video.closest?.('.html5-video-player');
      if (!player) { if (returnVideo === video) returnVideo = null; return; }
      const automaticReturn = returnVideo === video;
      try {
        // YouTube can report background state (3) until focus catches up with
        // visibility. Ownership, not that transient state, identifies our return.
        if (!automaticReturn && player.getVisibilityState?.() !== 7 && !player.classList.contains('ytp-player-document-picture-in-picture')) return;
        if (typeof player.setDocumentPictureInPicture === 'function') player.setDocumentPictureInPicture(false);
        else video.dispatchEvent(new Event('leavepictureinpicture'));
      } catch {}
      if (automaticReturn) {
        returnVideo = null;
        resizePlayer(player);
        trace('video-player-restored');
      }
    });
  };
  const closeOwned = async (reason = 'navigation') => {
    if (ownedPortal || ownedVideo) trace(`extension-close:${typeof reason === 'string' ? reason : 'navigation'}`);
    const portal = ownedPortal;
    ownedPortal = null;
    if (portal) {
      // Move the live player out BEFORE closing its document. Closing first can
      // strand a still-playing YouTube player in a discarded PiP document.
      portal.restore();
      try { portal.window.close(); } catch {}
    }
    const video = ownedVideo;
    ownedVideo = null;
    watchVideo(null);
    if (inNativePip(video)) {
      try { await videoDocument(video).exitPictureInPicture(); } catch {}
    }
    restorePlayer(video || returnVideo);
  };
  const openPortal = async (video, epoch) => {
    const player = video.closest('.html5-video-player') || video;
    const parent = player.parentNode;
    if (!parent) return;
    const marker = document.createComment('arc-mini-player-return');
    parent.insertBefore(marker, player);
    let pipWindow;
    let returned = false;
    const restore = () => {
      if (returned) return;
      returned = true;
      if (marker.parentNode) marker.parentNode.replaceChild(player, marker);
      else parent.appendChild(player);
      try { player.setDocumentPictureInPicture?.(false); } catch {}
      // YouTube recalculates inline video/control dimensions in the PiP window.
      // Restoring the DOM node alone leaves those 480px dimensions on the page.
      resizePlayer(player);
    };
    portalOpening = true;
    try {
      pipWindow = await window.documentPictureInPicture.requestWindow({ width: 480, height: Math.round(480 * video.videoHeight / video.videoWidth) });
      // Document PiP makes its opener visible even while another tab is active.
      // Chrome closes an automatic PiP window on return; a closed window, not
      // opener visibility, detects a return during this pending request.
      if (!enabled || disposed || pipWindow.closed || epoch !== activationEpoch) {
        lastError = `Portal cancelled: enabled=${enabled}, disposed=${disposed}, closed=${pipWindow.closed}, visibility=${document.visibilityState}`;
        restore(); pipWindow.close(); return;
      }
      const portal = { window: pipWindow, restore };
      // Register BEFORE adoption; this also handles Chrome closing Auto PiP on
      // activation before the source document receives visibilitychange.
      pipWindow.addEventListener('pagehide', () => {
        trace('document-window-pagehide');
        restore();
        if (ownedPortal === portal) {
          ownedPortal = null;
          if (document.visibilityState === 'hidden') dismissed = true;
        }
      }, { once: true, capture: true });
      const pipDocument = pipWindow.document;
      for (const sheet of document.styleSheets) {
        try {
          const style = pipDocument.createElement('style');
          style.textContent = [...sheet.cssRules].map(rule => rule.cssText).join('\n');
          pipDocument.head.appendChild(style);
        } catch {
          if (!sheet.href) continue;
          const link = pipDocument.createElement('link');
          link.rel = 'stylesheet'; link.href = sheet.href;
          pipDocument.head.appendChild(link);
        }
      }
      const layout = pipDocument.createElement('style');
      layout.textContent = 'html,body{margin:0;width:100%;height:100%;overflow:hidden;background:#000}.html5-video-player,.html5-video-container{width:100vw!important;height:100vh!important}video{width:100vw!important;height:100vh!important;left:0!important;top:0!important;object-fit:contain!important;visibility:visible!important}';
      pipDocument.head.appendChild(layout);
      ownedPortal = portal;
      pipDocument.body.appendChild(player);
      trace('document-player-opened');
      try { player.setDocumentPictureInPicture?.(true); } catch {}
    } catch (error) {
      lastError = `${error.name}: ${error.message}`;
      restore();
      if (ownedPortal?.window === pipWindow) ownedPortal = null;
      try { pipWindow?.close(); } catch {}
    } finally { portalOpening = false; }
  };
  const enterAutomatic = async () => {
    lastSkip = !enabled ? 'disabled' : disposed ? 'disposed' : opening ? 'pending' : dismissed ? 'dismissed' : window.documentPictureInPicture?.window ? 'existing-document-pip' : null;
    if (lastSkip) return;
    const roots = mediaRoots();
    if (roots.some(root => root.pictureInPictureElement)) { lastSkip = 'existing-video-pip'; return; }
    const video = playingVideo(roots);
    if (!video) { lastSkip = 'no-eligible-video'; return; }
    const epoch = activationEpoch;
    requestStartedAt = Date.now();
    trace('automatic-request');
    lastError = null;
    opening = true;
    try {
      // YouTube's native-video PiP bookkeeping can leave its watch page blank.
      // Document PiP keeps the SAME player and explicitly returns its DOM node.
      // Keep the proven YouTube adapter. Other HTML5 players stay in their own
      // document and use native video PiP without adopting/moving any DOM.
      if (!preferNativeVideo && videoDocument(video) === document && video.closest?.('.html5-video-player') && typeof window.documentPictureInPicture?.requestWindow === 'function') {
        await openPortal(video, epoch);
        return;
      }
      watchVideo(video);
      await video.requestPictureInPicture();
      if (inNativePip(video)) { ownedVideo = video; returnVideo = video; trace('video-player-opened'); }
      else watchVideo(null);
      // PiP can also make a native video's background opener visible. Chrome
      // owns automatic return/closure; we close explicitly only when disabled.
      if (!enabled || disposed || epoch !== activationEpoch) await closeOwned();
    } catch (error) {
      watchVideo(null);
      lastError = `${error.name}: ${error.message}`;
      // Permission denial/unsupported media must not create extension errors.
    } finally { opening = false; }
  };
  const handler = async (details = {}) => {
    const reason = details.enterPictureInPictureReason;
    lastAction = { reason: reason ?? null, visibility: document.visibilityState, focused: hasFocus() };
    const automatic = reason === 'contentoccluded' || (!reason && document.visibilityState === 'hidden');
    if (automatic) return enabled ? enterAutomatic() : undefined;
    // Keep the site's own manually invoked player behavior.
    if (siteHandler) return siteHandler(details);
    if (!automatic) {
      const video = playingVideo();
      if (video && !document.pictureInPictureElement) {
        try { await video.requestPictureInPicture(); } catch {}
      }
    }
  };
  const wrappedSetter = function(action, callback) {
    if (action !== 'enterpictureinpicture') return originalSetter.call(session, action, callback);
    if (callback !== null && typeof callback !== 'function') return originalSetter.call(session, action, callback);
    siteHandler = callback;
    return setHandler(enabled ? handler : callback);
  };
  session.setActionHandler = wrappedSetter;
  const onVisibility = () => {
    if (document.visibilityState === 'visible') {
      dismissed = false;
      // Automatic Document PiP is returned by pagehide, including when Chrome
      // closes it before the source tab's activation/visibility events arrive.
      if (portalOpening || ownedPortal || inNativePip(ownedVideo)) return;
      const video = returnVideo;
      closeOwned('visibility-recovery').then(() => restorePlayer(video));
    }
  };
  const onLeave = event => {
    if (event.target !== ownedVideo) return;
    trace('video-player-left');
    ownedVideo = null;
    watchVideo(null);
    if (document.visibilityState === 'hidden') dismissed = true;
    else restorePlayer(event.target);
  };
  document.addEventListener('visibilitychange', onVisibility);
  document.addEventListener('leavepictureinpicture', onLeave, true);
  document.addEventListener('yt-navigate-start', closeOwned);
  globalThis[KEY] = {
    version: VERSION,
    getGuideState(inspectVideo = false) {
      const roots = inspectVideo && enabled ? mediaRoots() : null;
      const hasPip = Boolean(ownedPortal || ownedVideo || document.pictureInPictureElement || window.documentPictureInPicture?.window);
      return { lastAutomaticOpenAt, opening, hasPip,
        eligible: Boolean(roots && !opening && !hasPip && !roots.some(root => root.pictureInPictureElement) && playingVideo(roots)) };
    },
    getState() {
      return { version: VERSION, enabled, opening, player: ownedPortal ? 'document' : ownedVideo ? 'video' : 'none', visibility: document.visibilityState, focused: hasFocus(), sourceActive, lastAction, lastSkip, lastError, recentEvents: recentEvents.map(event => ({ ...event })),
        videos: videosIn(mediaRoots()).map(video => ({ paused: video.paused, muted: video.muted, volume: video.volume, readyState: video.readyState, videoWidth: video.videoWidth, disablePictureInPicture: video.disablePictureInPicture })) };
    },
    configure(value, active, activatedAt = 0) {
      if (disposed) return false;
      enabled = value === true;
      if (typeof active === 'boolean') {
        sourceActive = active;
        // Cached `tab.active` and queued configuration calls are not new focus
        // events. Only an activation that happened AFTER this request cancels
        // it; an old source activation must not close a newly opened player.
        if (active && typeof activatedAt === 'number' && activatedAt > lastActivationAt) {
          lastActivationAt = activatedAt;
          if (activatedAt >= requestStartedAt) {
            activationEpoch++; dismissed = false; trace('source-tab-activated'); closeOwned('tab-activation');
          }
        }
      }
      if (!enabled) closeOwned('disabled');
      // Also recover a stale player left by the previous injected version.
      if (document.visibilityState === 'visible' && document.querySelectorAll('.html5-video-player').length) restorePlayer(playingVideo());
      try { setHandler(enabled ? handler : siteHandler); return true; }
      catch { enabled = false; return false; }
    },
    dispose() {
      disposed = true; enabled = false; closeOwned('disposed');
      document.removeEventListener('visibilitychange', onVisibility);
      document.removeEventListener('leavepictureinpicture', onLeave, true);
      document.removeEventListener('yt-navigate-start', closeOwned);
      if (session.setActionHandler === wrappedSetter) session.setActionHandler = originalSetter;
      try { setHandler(siteHandler); } catch {}
    }
  };
})();
