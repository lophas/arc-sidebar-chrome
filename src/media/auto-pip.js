(() => {
  if (window.top !== window || !navigator.mediaSession || !document.pictureInPictureEnabled) return;
  const KEY = '__arcSidebarAutoPip';
  const VERSION = 3;
  if (globalThis[KEY]?.version === VERSION) return;
  globalThis[KEY]?.dispose();
  const session = navigator.mediaSession;
  const originalSetter = session.setActionHandler;
  let siteHandler = null;
  let enabled = false;
  let ownedVideo = null;
  let returnVideo = null;
  let ownedPortal = null;
  let opening = false;
  let dismissed = false;
  let disposed = false;
  let lastError = null;
  const setHandler = handler => originalSetter.call(session, 'enterpictureinpicture', handler);
  const playingVideo = () => [...document.querySelectorAll('video')]
    .filter(video => !video.paused && !video.ended && !video.muted && video.volume > 0 && video.readyState >= 2 && video.videoWidth > 0 && !video.disablePictureInPicture)
    .sort((a, b) => b.videoWidth * b.videoHeight - a.videoWidth * a.videoHeight)[0];
  const restorePlayer = video => {
    if (!video) return;
    // Native leave events and YouTube's visibility handlers can arrive in either
    // order. Let them finish before correcting a stale player-side PiP state.
    requestAnimationFrame(() => {
      if (document.visibilityState !== 'visible' || document.pictureInPictureElement || window.documentPictureInPicture?.window || !video.isConnected) return;
      const player = video.closest('.html5-video-player');
      if (!player) return;
      try {
        if (player.getVisibilityState?.() !== 7 && !player.classList.contains('ytp-player-document-picture-in-picture')) return;
        if (typeof player.setDocumentPictureInPicture === 'function') player.setDocumentPictureInPicture(false);
        else video.dispatchEvent(new Event('leavepictureinpicture'));
      } catch {}
    });
  };
  const closeOwned = async () => {
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
    if (video && document.pictureInPictureElement === video) {
      try { await document.exitPictureInPicture(); } catch {}
    }
    restorePlayer(video);
  };
  const openPortal = async video => {
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
    };
    try {
      pipWindow = await window.documentPictureInPicture.requestWindow({ width: 480, height: Math.round(480 * video.videoHeight / video.videoWidth) });
      // The source tab may have returned while Chrome was creating the window.
      if (!enabled || disposed || pipWindow.closed || document.visibilityState !== 'hidden') {
        lastError = `Portal cancelled: enabled=${enabled}, disposed=${disposed}, closed=${pipWindow.closed}, visibility=${document.visibilityState}`;
        restore(); pipWindow.close(); return;
      }
      const portal = { window: pipWindow, restore };
      // Register BEFORE adoption; this also handles Chrome closing Auto PiP on
      // activation before the source document receives visibilitychange.
      pipWindow.addEventListener('pagehide', () => {
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
      try { player.setDocumentPictureInPicture?.(true); } catch {}
    } catch (error) {
      lastError = `${error.name}: ${error.message}`;
      restore();
      if (ownedPortal?.window === pipWindow) ownedPortal = null;
      try { pipWindow?.close(); } catch {}
    }
  };
  const enterAutomatic = async () => {
    if (!enabled || disposed || opening || dismissed || document.pictureInPictureElement || window.documentPictureInPicture?.window) return;
    const video = playingVideo();
    if (!video) return;
    opening = true;
    try {
      // YouTube's native-video PiP bookkeeping can leave its watch page blank.
      // Document PiP keeps the SAME player and explicitly returns its DOM node.
      if (typeof window.documentPictureInPicture?.requestWindow === 'function') {
        await openPortal(video);
        return;
      }
      await video.requestPictureInPicture();
      if (document.pictureInPictureElement === video) { ownedVideo = video; returnVideo = video; }
      // The user may return to the source tab or disable the setting mid-request.
      if (!enabled || disposed || document.visibilityState !== 'hidden') await closeOwned();
    } catch {
      // Permission denial/unsupported media must not create extension errors.
    } finally { opening = false; }
  };
  const handler = async (details = {}) => {
    const reason = details.enterPictureInPictureReason;
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
      const video = returnVideo;
      returnVideo = null;
      closeOwned().then(() => restorePlayer(video));
    }
  };
  const onLeave = event => {
    if (event.target !== ownedVideo) return;
    ownedVideo = null;
    if (document.visibilityState === 'hidden') dismissed = true;
    else { returnVideo = null; restorePlayer(event.target); }
  };
  document.addEventListener('visibilitychange', onVisibility);
  document.addEventListener('leavepictureinpicture', onLeave, true);
  document.addEventListener('yt-navigate-start', closeOwned);
  globalThis[KEY] = {
    version: VERSION,
    getState() {
      return { version: VERSION, enabled, opening, player: ownedPortal ? 'document' : ownedVideo ? 'video' : 'none', visibility: document.visibilityState, lastError };
    },
    configure(value) {
      if (disposed) return false;
      enabled = value === true;
      if (!enabled) closeOwned();
      // Also recover a stale player left by the previous injected version.
      if (document.visibilityState === 'visible') restorePlayer(playingVideo());
      try { setHandler(enabled ? handler : siteHandler); return true; }
      catch { enabled = false; return false; }
    },
    dispose() {
      disposed = true; enabled = false; closeOwned();
      document.removeEventListener('visibilitychange', onVisibility);
      document.removeEventListener('leavepictureinpicture', onLeave, true);
      document.removeEventListener('yt-navigate-start', closeOwned);
      if (session.setActionHandler === wrappedSetter) session.setActionHandler = originalSetter;
      try { setHandler(siteHandler); } catch {}
    }
  };
})();
