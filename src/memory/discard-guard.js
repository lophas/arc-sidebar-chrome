(() => {
  if (globalThis.__arcSidebarDiscardGuard) return;
  const tracks = new Set();
  let pending = 0;
  // Only a document_start installation can attest to captures started by
  // this document. Existing pages without this guard are left untouched.
  let verified = document.readyState === 'loading';
  const edits = new Set(), seen = new WeakMap();
  const fingerprint = value => {
    value = String(value ?? ''); let hash = 2166136261;
    for (let i = 0; i < value.length; i++) hash = Math.imul(hash ^ value.charCodeAt(i), 16777619);
    return value.length + ':' + (hash >>> 0);
  };
  const valueOf = field => field.isContentEditable ? field.textContent : ['checkbox', 'radio'].includes(field.type) ? field.checked : field.value;
  const remember = event => {
    const field = event.composedPath()[0];
    if (!event.isTrusted || !field || !field.matches?.('input,textarea,select,[contenteditable]') || seen.has(field)) return;
    const baseline = event.type === 'beforeinput' ? valueOf(field)
      : ['checkbox', 'radio'].includes(field.type) ? field.defaultChecked : field.defaultValue;
    const edit = { ref: new WeakRef(field), baseline: fingerprint(baseline) };
    seen.set(field, edit); edits.add(edit);
  };
  document.addEventListener('beforeinput', remember, { capture: true, passive: true });
  document.addEventListener('input', remember, { capture: true, passive: true });
  document.addEventListener('reset', event => {
    queueMicrotask(() => {
      if (event.defaultPrevented) return;
      for (const edit of edits) {
        const field = edit.ref.deref();
        if (!field || field.form === event.target) { edits.delete(edit); if (field) seen.delete(field); }
      }
    });
  }, { capture: true, passive: true });
  globalThis.__arcSidebarDiscardGuard = {
    state: () => {
      for (const edit of edits) {
        const field = edit.ref.deref();
        if (!field?.isConnected || fingerprint(valueOf(field)) === edit.baseline) {
          edits.delete(edit); if (field) seen.delete(field);
        }
      }
      return { verified, editing: edits.size > 0, capturing: pending > 0 || [...tracks].some(track => track.readyState === 'live') };
    }
  };
  const devices = navigator.mediaDevices;
  for (const name of ['getUserMedia', 'getDisplayMedia']) {
    const original = devices?.[name];
    if (typeof original !== 'function') continue;
    const wrapped = function (...args) {
      let request;
      try { request = Reflect.apply(original, this, args); } catch (error) { throw error; }
      pending++;
      return Promise.resolve(request).then(stream => {
        for (const track of stream.getTracks()) {
          tracks.add(track);
          track.addEventListener('ended', () => tracks.delete(track), { once: true });
        }
        return stream;
      }).finally(() => { pending--; });
    };
    try { devices[name] = wrapped; if (devices[name] !== wrapped) verified = false; }
    catch { verified = false; }
  }
})();
