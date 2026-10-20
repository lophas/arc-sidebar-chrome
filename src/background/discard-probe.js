// Runs only when an otherwise eligible tab reaches its idle deadline. No page
// timers or continuous DOM scans are needed.
export async function probeDiscardSafety(extensionOrigin) {
  // The extension's own embedded sidebar is UI, not page content to protect.
  if (extensionOrigin && location.origin === extensionOrigin) return { safe: true };
  const guard = globalThis.__arcSidebarDiscardGuard?.state();
  if (!guard?.verified) return { safe: false, reason: 'unverified' };
  if (guard.capturing) return { safe: false, reason: 'capture' };
  if (guard.editing) return { safe: false, reason: 'editing' };
  const pip = globalThis.__arcSidebarAutoPip?.getState?.();
  if (document.pictureInPictureElement || window.documentPictureInPicture?.window || pip && pip.player !== 'none') {
    return { safe: false, reason: 'pip' };
  }
  const mediaState = navigator.mediaSession?.playbackState;
  if (mediaState === 'playing' || document.fullscreenElement || document.pointerLockElement) return { safe: false, reason: 'media' };
  const roots = [document];
  for (let index = 0; index < roots.length; index++) {
    const root = roots[index];
    for (const media of root.querySelectorAll('video,audio')) {
      if (!media.paused && !media.ended) return { safe: false, reason: 'media' };
    }
    for (const field of root.querySelectorAll('input,textarea,select,[contenteditable]')) {
      if (field.disabled || field.readOnly) continue;
      if (field.isContentEditable && field.textContent.trim()) return { safe: false, reason: 'editing' };
      if (field.tagName === 'SELECT') {
        const options = [...field.options], explicit = options.some(option => option.defaultSelected);
        if (options.some((option, index) => option.selected !== (option.defaultSelected || !explicit && !field.multiple && index === 0))) return { safe: false, reason: 'editing' };
      } else if (['checkbox', 'radio'].includes(field.type)) {
        if (field.checked !== field.defaultChecked) return { safe: false, reason: 'editing' };
      } else if (!['hidden', 'submit', 'button', 'reset', 'image', 'range', 'color'].includes(field.type) && field.value !== undefined && field.value !== field.defaultValue) {
        return { safe: false, reason: 'editing' };
      }
    }
    for (const element of root.querySelectorAll('*')) if (element.shadowRoot) roots.push(element.shadowRoot);
  }
  return { safe: true };
}
