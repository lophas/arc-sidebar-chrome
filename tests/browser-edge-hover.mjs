import assert from 'node:assert/strict';
import fs from 'node:fs';
import { execFileSync } from 'node:child_process';
import { chromium } from 'playwright-core';

const executablePath = process.env.ASOTC_CHROME_BINARY || ['google-chrome', 'chromium'].map(name => {
  try { return execFileSync('which', [name], { encoding: 'utf8' }).trim(); } catch { return null; }
}).find(Boolean);
assert.ok(executablePath, 'Chrome executable required');
const reference = process.argv.find(arg => arg.startsWith('--regression-ref='))?.split('=')[1];
const source = fs.readFileSync('src/overlay/overlay.js', 'utf8');
const origin = 'https://edge.test';
const browser = await chromium.launch({ executablePath, headless: false, args: ['--no-sandbox', '--disable-features=OverlayScrollbar'] });

async function fixture(code, scale = 1) {
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: scale });
  await context.addInitScript(() => {
    const attach = Element.prototype.attachShadow;
    Element.prototype.attachShadow = function(options) {
      const root = attach.call(this, options);
      if (this.id === 'arc-sidebar-overlay-host') window.arcTestShadow = root;
      return root;
    };
    // Reproduce platforms reporting rounded/zero movement while client
    // coordinates change. Events themselves remain real trusted Chrome input.
    for (const name of ['movementX', 'movementY']) {
      const descriptor = Object.getOwnPropertyDescriptor(MouseEvent.prototype, name);
      Object.defineProperty(MouseEvent.prototype, name, { configurable: true, get() {
        return window.arcZeroMovement ? 0 : descriptor.get.call(this);
      } });
    }
  });
  await context.route(origin + '/**', async route => {
    const path = new URL(route.request().url()).pathname;
    if (path.endsWith('/src/sidepanel/index.html')) {
      // Iframe load, editor reports and the slide animation overlap deliberately.
      await new Promise(resolve => setTimeout(resolve, 180));
      return route.fulfill({ contentType: 'text/html', body: '<!doctype html><meta charset="utf-8"><body style="margin:0;height:100vh;background:#202023;color:white"><button id="inside" style="margin:30px">Sidebar button</button><script>parent.postMessage({type:"arc-sidebar-editor-state",open:false},"*");</script>' });
    }
    return route.fulfill({ contentType: 'text/html', body: `<!doctype html><meta charset="utf-8"><title>Edge hover</title><body style="margin:0;height:1800px;background:#eee"><h1>Page content</h1><script>
      window.arcSettings={arcSidebarMode:'overlay',arcSidebarAutohideTimeout:500};
      window.arcTestRuntimeListeners=[];window.arcZeroMovement=true;
      window.arcPointerLog=[];
      document.addEventListener('pointermove',e=>{arcPointerLog.push({event:'move',x:e.clientX,y:e.clientY,dx:e.movementX,dy:e.movementY,visibility:document.visibilityState});if(arcPointerLog.length>20)arcPointerLog.shift();},true);
      document.addEventListener('visibilitychange',()=>arcPointerLog.push({event:document.visibilityState}));
      window.chrome={storage:{local:{get:async()=>({...arcSettings}),set:async value=>Object.assign(arcSettings,value)},onChanged:{addListener(){},removeListener(){}}},runtime:{id:'test',getURL:path=>location.origin+'/'+path,sendMessage:async message=>message.type==='arc-sidebar-panel-layout'?{side:window.arcSide||'right'}:{open:false},onMessage:{addListener:fn=>arcTestRuntimeListeners.push(fn),removeListener:fn=>{arcTestRuntimeListeners=arcTestRuntimeListeners.filter(value=>value!==fn);}}}};
      </script>` });
  });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(origin + '/page');
  await page.addScriptTag({ content: code });
  await page.waitForFunction(() => !!window.arcTestShadow);
  return { context, page, errors, isOpen: () => page.evaluate(() => arcTestShadow.querySelector('.panel').classList.contains('open')) };
}

try {
  if (reference) {
    const old = execFileSync('git', ['show', reference + ':src/overlay/overlay.js'], { encoding: 'utf8' });
    const f = await fixture(old);
    const edge = await f.page.evaluate(() => arcTestShadow.querySelector('.edge').getBoundingClientRect().left + 1);
    await f.page.mouse.move(500, 300); await f.page.mouse.move(edge, 300);
    await f.page.waitForTimeout(250);
    assert.equal(await f.isOpen(), false, 'known-bad controller fails with trusted zero-delta pointer events');
    await f.context.close();
    console.log('PASS regression: previous controller reproduces missed edge hover with zero movement deltas');
  }
  for (const scale of [1, 2]) {
    const f = await fixture(source, scale);
    const { page } = f;
    for (const side of ['right', 'left']) {
      await page.evaluate(side => { window.arcSide = side; window.dispatchEvent(new Event('focus')); }, side);
      await page.waitForFunction(side => arcTestShadow.querySelector('.panel').classList.contains('left') === (side === 'left'), side);
      const edge = await page.evaluate(() => {
        const r = arcTestShadow.querySelector('.edge').getBoundingClientRect(); return (r.left + r.right) / 2;
      });
      const inside = side === 'left' ? 140 : 1140;
      const open = async () => {
        await page.mouse.move(640, 300); await page.mouse.move(edge, 300);
        // A stationary packet arriving during the opening delay cannot cancel it.
        await page.waitForTimeout(25); await page.mouse.move(edge, 300);
        await page.waitForFunction(() => arcTestShadow.querySelector('.panel').classList.contains('open'), {}, { timeout: 1200 });
      };
      await open();
      await page.waitForTimeout(750);
      assert.equal(await f.isOpen(), true, 'slide animation and delayed iframe initialization cannot close the panel');
      await page.mouse.move(inside, 300);
      await page.waitForFunction(() => !!arcTestShadow.querySelector('iframe').contentDocument?.querySelector('#inside'));
      const frame = page.frames().find(frame => frame.url().includes('/src/sidepanel/index.html'));
      assert.ok(frame); await frame.locator('#inside').click();
      await page.waitForTimeout(650);
      assert.equal(await f.isOpen(), true, 'pointer/focus entering the iframe keeps it open');
      await page.mouse.move(640, 300); await page.waitForTimeout(200);
      await page.mouse.move(inside, 300); await page.waitForTimeout(650);
      assert.equal(await f.isOpen(), true, 'iframe reentry cancels closing');
      await page.mouse.move(640, 300);
      for (let i = 0; i < 6; i++) { await page.waitForTimeout(100); await page.mouse.move(620 - i * 5, 300); }
      assert.equal(await f.isOpen(), false, 'continued page movement cannot keep postponing closing');
      // Repeated edge attempts exercise the same host and iframe listeners.
      for (let i = 0; i < 8; i++) {
        await open(); await page.mouse.move(inside, 320);
        await page.waitForTimeout(100); assert.equal(await f.isOpen(), true);
        await page.mouse.move(640, 320);
        await page.waitForFunction(() => !arcTestShadow.querySelector('.panel').classList.contains('open'));
      }
      await open();
      const other = await f.context.newPage(); await other.goto('about:blank'); await other.bringToFront();
      await page.waitForFunction(() => !arcTestShadow.querySelector('.panel').classList.contains('open'));
      await page.bringToFront(); await page.waitForTimeout(250);
      assert.equal(await f.isOpen(), false, 'actual tab return does not reopen the sidebar');
      await page.mouse.move(edge, 300); await page.waitForTimeout(150);
      if(await f.isOpen())console.log('Unexpected return hover:',JSON.stringify(await page.evaluate(()=>arcPointerLog)));
      assert.equal(await f.isOpen(), false, 'stationary zero-delta event after return cannot open');
      await other.close(); await open();
      await page.mouse.move(640, 300);
      await page.waitForFunction(() => !arcTestShadow.querySelector('.panel').classList.contains('open'));
      console.log(`PASS real Chrome edge hover: ${side}, DPR ${scale}, zero deltas, scrollbars, iframe handoff, stable deadlines, repeated opening and actual tab return`);
    }
    assert.deepEqual(f.errors, []);
    assert.equal(await page.locator('#arc-sidebar-overlay-host').count(), 1);
    await f.context.close();
  }
} finally { await browser.close(); }
