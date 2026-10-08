"""Real Chromium page-load/observer regression; no npm dependency required."""
import argparse
import functools
import http.server
import pathlib
import shutil
import subprocess
import tempfile
import threading

parser = argparse.ArgumentParser()
parser.add_argument('--require-browser', action='store_true')
parser.add_argument('--source', default='src/overlay/overlay.js')
parser.add_argument('--regression-ref', help='Prove that the known faulty commit fails the same real-browser check')
args = parser.parse_args()
browser = next((shutil.which(name) for name in ('google-chrome', 'chromium', 'chromium-browser') if shutil.which(name)), None)
if not browser:
    if args.require_browser:
        raise SystemExit('Chromium/Google Chrome required for browser regression')
    print('SKIP real browser regression: Chromium/Google Chrome unavailable')
    raise SystemExit(0)

html = '''<!doctype html><meta charset="utf-8"><title>Overlay regression</title><body><p>Page content</p>
<script>
const mode = new URLSearchParams(location.search).get('mode');
const failures = []; let loaded = false; let callbacks = 0;
addEventListener('error', e => failures.push(e.message));
addEventListener('load', () => loaded = true);
const NativeObserver = MutationObserver;
window.MutationObserver = class extends NativeObserver {
 constructor(callback) { super((records, observer) => {
   if (++callbacks > 200) { failures.push('Observer starvation'); observer.disconnect(); return; }
   callback(records, observer);
 }); }
};
window.chrome = {
 storage: { local: { get: async () => ({arcSidebarMode:mode,arcSidebarEdgeSide:"right"}), set: async () => {} }, onChanged: { addListener(fn){(window.arcTestStorageListeners ||= []).push(fn);} } },
 runtime: { getURL: path => location.origin+'/'+path, sendMessage: async message => message.type === 'arc-sidebar-panel-layout' ? {side:window.arcTestSide || 'right'} : {open:false}, onMessage: { addListener(){} } }
};
</script><script src="overlay.js"></script><script>
setTimeout(() => {
 const host=document.getElementById('arc-sidebar-overlay-host');
 if(mode==='overlay') {
   if(!host) failures.push('Missing overlay host');
   else { host.style.cssText='display: none'; host.hidden=true; host.remove(); }
 } else if(host) failures.push('Native mode injected overlay');
},100);
setTimeout(() => {
 const host=document.getElementById('arc-sidebar-overlay-host');
 if(mode==='overlay' && (!host || host.hidden || getComputedStyle(host).display==='none')) failures.push('Host repair failed');
 if(!loaded) failures.push('Page load event blocked');
 const result=document.createElement('pre'); result.id='result';
 result.textContent=failures.length ? 'FAIL '+failures.join('; ') : 'PASS '+mode+' page loaded; callbacks='+callbacks;
 document.body.append(result);
},600);
</script>'''

class QuietHandler(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *args):
        pass

with tempfile.TemporaryDirectory() as folder:
    root = pathlib.Path(folder)
    (root/'index.html').write_text(html)
    (root/'overlay.js').write_text(pathlib.Path(args.source).read_text())
    server = http.server.ThreadingHTTPServer(('127.0.0.1',0), functools.partial(QuietHandler,directory=folder))
    threading.Thread(target=server.serve_forever,daemon=True).start()
    try:
        for mode in ('overlay','native'):
            result=subprocess.run(['node','tests/browser-overlay-driver.mjs',browser,f'http://127.0.0.1:{server.server_port}/index.html?mode={mode}'],capture_output=True,text=True,timeout=25)
            if result.returncode or f'PASS {mode} page loaded' not in result.stdout:
                raise SystemExit(f'{mode} browser regression FAILED:\n{result.stdout}\n{result.stderr[-2000:]}')
            print(f'PASS real Chromium: {mode} page load, event-loop progress and DOM repair')
        if args.regression_ref:
            old_source = subprocess.check_output(['git','show',args.regression_ref+':src/overlay/overlay.js'],text=True)
            (root/'overlay.js').write_text(old_source)
            result=subprocess.run(['node','tests/browser-overlay-driver.mjs',browser,f'http://127.0.0.1:{server.server_port}/index.html?mode=overlay'],capture_output=True,text=True,timeout=25)
            if not result.returncode or 'Observer starvation' not in result.stdout:
                raise SystemExit('Known-bad baseline did not reproduce observer starvation:\n'+result.stdout+'\n'+result.stderr)
            print('PASS real Chromium: known-bad baseline reproduced '+result.stdout.strip())
    finally:
        server.shutdown()
