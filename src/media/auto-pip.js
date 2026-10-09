(() => {
  if (window.top !== window || !navigator.mediaSession || !document.pictureInPictureEnabled) return;
  const KEY = '__arcSidebarAutoPip';
  const VERSION = 2;
  if (globalThis[KEY]?.version === VERSION) return;
  globalThis[KEY]?.dispose();
  const session = navigator.mediaSession;
  const originalSetter = session.setActionHandler;
  let siteHandler = null;
  let enabled = false;
  let ownedVideo = null;
  let returnVideo = null;
  let opening = false;
  let dismissed = false;
  let disposed = false;
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
    const video = ownedVideo;
    ownedVideo = null;
    if (video && document.pictureInPictureElement === video) {
      try { await document.exitPictureInPicture(); } catch {}
    }
    restorePlayer(video);
  };
  const enterAutomatic = async () => {
    if (!enabled || disposed || opening || dismissed || document.pictureInPictureElement || window.documentPictureInPicture?.window) return;
    const video = playingVideo();
    if (!video) return;
    opening = true;
    try {
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
  globalThis[KEY] = {
    version: VERSION,
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
      if (session.setActionHandler === wrappedSetter) session.setActionHandler = originalSetter;
      try { setHandler(siteHandler); } catch {}
    }
  };
})();
