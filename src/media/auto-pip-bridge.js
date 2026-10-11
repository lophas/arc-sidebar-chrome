(() => {
  if (window.top !== window || location.protocol !== 'https:') return;
  const CONTROLLER = '__arcSidebarAutoPipGuide';
  if (globalThis[CONTROLLER]) return;
  const KEY = 'arcSidebarAutoPipEnabled';
  const DISMISS_KEY = `arcSidebarAutoPipGuideDismissed:${location.origin}`;
  const MIN_AWAY_MS = 1500;
  let enabled = true;
  let dismissed = false;
  let shown = false;
  let sourceActive = false;
  let needed = false;
  let departure = null;
  let host = null;
  let dialog = null;
  let disposed = false;
  let preferenceChanged = false;
  let dismissalChanged = false;

  const settingsReady = chrome.storage.local.get([KEY, DISMISS_KEY]).then(stored => {
    if (!preferenceChanged) enabled = stored[KEY] !== false;
    if (!dismissalChanged) dismissed = stored[DISMISS_KEY] === true;
  }).catch(() => { enabled = false; });

  function removePopup() {
    dialog?.close();
    host?.remove();
    host = null;
    dialog = null;
  }

  async function dismiss(permanent = false) {
    needed = false;
    shown = true;
    removePopup();
    if (permanent) {
      dismissed = true;
      try { await chrome.storage.local.set({ [DISMISS_KEY]: true }); } catch {}
    }
  }

  function buildPopup() {
    host = document.createElement('div');
    host.id = 'arc-auto-pip-guide';
    const shadow = host.attachShadow({ mode: 'open' });
    shadow.innerHTML = `
      <style>
        :host{all:initial;color-scheme:dark}
        dialog{box-sizing:border-box;width:min(440px,calc(100vw - 32px));max-height:calc(100vh - 32px);overflow:auto;border:1px solid #626267;border-radius:24px;padding:28px;background:#202124;color:#f1f3f4;box-shadow:0 12px 48px #0008;font:15px/1.5 -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}
        dialog::backdrop{background:#0004;backdrop-filter:blur(2px)}
        .brand{margin:0 0 12px;color:#aeb1b8;font-size:11px;letter-spacing:.02em}
        h2{margin:0 28px 14px 0;font-size:21px;line-height:1.35;overflow-wrap:anywhere}
        p{margin:0 0 16px}
        .steps{color:#d6d8de;font-size:13px}
        .site{display:block;box-sizing:border-box;width:100%;border:1px solid #5f6368;border-radius:10px;background:#292a2d;color:#e8eaed;padding:10px 12px;margin:0 0 18px;font:13px/1.4 ui-monospace,SFMono-Regular,Consolas,monospace}
        button{box-sizing:border-box;cursor:pointer;font:inherit;color:#e8eaed}
        .action{display:block;width:100%;min-height:46px;padding:10px 16px;margin:10px 0 0;border:0;border-radius:999px;background:#3c4043;font-weight:600}
        .primary{background:#a8c7fa;color:#062e6f}
        .action:hover{filter:brightness(1.12)}
        .action:disabled{opacity:.55;cursor:wait}
        .quiet{display:block;margin:16px auto 0;border:0;padding:2px;background:none;color:#aeb1b8;font-size:12px;text-decoration:underline;text-underline-offset:3px}
        .close{position:absolute;top:18px;right:18px;width:28px;height:28px;border:0;border-radius:50%;background:none;color:#aeb1b8;font-size:22px;line-height:1}
        .close:hover{background:#3c4043}
        button:focus-visible,.site:focus-visible{outline:2px solid #a8c7fa;outline-offset:3px}
        .status{margin:12px 0 0;font-size:12px;color:#fdd663;overflow-wrap:anywhere}
        .status:empty{display:none}
        @media(max-width:360px){dialog{padding:22px 18px}h2{font-size:18px}.action{font-size:14px}}
      </style>
      <dialog aria-labelledby="title" aria-describedby="description steps">
        <button class="close" type="button" title="Not now" aria-label="Not now">×</button>
        <div class="brand">Arc Side of the Chrome · Mini player setup</div>
        <h2 id="title">Enable the mini player for <span id="siteName"></span></h2>
        <p id="description">If the mini player didn’t open when you switched tabs, allow this website in Chrome’s Automatic picture-in-picture settings.</p>
        <p id="steps" class="steps">The button copies this website’s address and opens the PiP settings. Under <strong>Allowed</strong>, click <strong>Add</strong>, paste the address and save. Then return to your video.</p>
        <input class="site" id="siteAddress" type="text" readonly aria-label="Website address">
        <button class="action primary" id="openSettings" type="button" autofocus>Copy site &amp; open PiP settings</button>
        <button class="action" id="later" type="button">Not now</button>
        <button class="quiet" id="dismissSite" type="button">Don’t show again on this website</button>
        <p class="status" id="status" role="status"></p>
      </dialog>`;
    shadow.querySelector('#siteName').textContent = location.host;
    shadow.querySelector('#siteAddress').value = location.origin;
    dialog = shadow.querySelector('dialog');
    dialog.addEventListener('cancel', event => { event.preventDefault(); dismiss(); });
    shadow.querySelector('.close').addEventListener('click', () => dismiss());
    shadow.querySelector('#later').addEventListener('click', () => dismiss());
    shadow.querySelector('#dismissSite').addEventListener('click', () => dismiss(true));
    shadow.querySelector('#openSettings').addEventListener('click', async event => {
      const button = event.currentTarget;
      const status = shadow.querySelector('#status');
      button.disabled = true;
      let copied = false;
      try {
        // Copy only from this explicit click, preserving the user's clipboard otherwise.
        try { await navigator.clipboard.writeText(location.origin); copied = true; } catch {}
        const response = await chrome.runtime.sendMessage({ type: 'arc-auto-pip-open-settings' });
        if (!response?.ok) throw new Error(response?.error || 'Could not open Chrome settings.');
        shadow.querySelector('#later').textContent = 'Done';
        status.textContent = copied ? 'Website address copied. Add it to the Allowed list in Chrome.' : 'Copy the website address above and add it to the Allowed list in Chrome.';
      } catch (error) {
        status.textContent = `Could not open PiP settings: ${error.message}`;
      } finally { button.disabled = false; }
    });
    (document.body || document.documentElement).append(host);
  }

  async function showIfNeeded() {
    await settingsReady;
    if (disposed || !enabled || dismissed || !sourceActive || document.visibilityState !== 'visible') return;
    if (!host) {
      if (!needed || shown) return;
      shown = true;
      buildPopup();
    }
    if (!dialog.open) dialog.showModal();
  }

  function onFocus(message, sender) {
    if (message?.type !== 'arc-auto-pip-guide-focus' || sender.id !== chrome.runtime.id || typeof message.active !== 'boolean') return;
    sourceActive = message.active;
    const guide = message.guide;
    if (!sourceActive) {
      dialog?.close();
      departure = guide?.eligible ? { at: message.changedAt, openedAt: guide.lastAutomaticOpenAt } : null;
      return;
    }
    const previous = departure;
    departure = null;
    if (previous && guide?.lastAutomaticOpenAt > previous.openedAt) { needed = false; removePopup(); }
    if (previous && guide?.eligible && !guide.opening && !guide.hasPip &&
        message.changedAt - previous.at >= MIN_AWAY_MS && guide.lastAutomaticOpenAt === previous.openedAt) needed = true;
    showIfNeeded().catch(() => {});
  }

  function onSettings(changes, area) {
    if (area !== 'local') return;
    if (changes[KEY]) { preferenceChanged = true; enabled = changes[KEY].newValue !== false; }
    if (changes[DISMISS_KEY]) { dismissalChanged = true; dismissed = changes[DISMISS_KEY].newValue === true; }
    if (!enabled || dismissed) { needed = false; departure = null; removePopup(); }
  }

  function onVisibility() {
    if (document.visibilityState === 'hidden') dialog?.close();
    else showIfNeeded().catch(() => {});
  }

  globalThis[CONTROLLER] = {
    dispose() {
      disposed = true;
      removePopup();
      chrome.runtime.onMessage.removeListener(onFocus);
      chrome.storage.onChanged.removeListener(onSettings);
      document.removeEventListener('visibilitychange', onVisibility);
      delete globalThis[CONTROLLER];
    }
  };
  chrome.runtime.onMessage.addListener(onFocus);
  chrome.storage.onChanged.addListener(onSettings);
  document.addEventListener('visibilitychange', onVisibility);
  try {
    if (chrome.runtime.id) chrome.runtime.sendMessage({ type: 'arc-auto-pip-ready' }).catch(() => {});
  } catch {}
})();
