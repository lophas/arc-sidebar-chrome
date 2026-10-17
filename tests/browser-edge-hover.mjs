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

async function fixture(code, scale = 1, { side = 'right', layoutDelay = 0, sampleClosed = false } = {}) {
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: scale });
  await context.addInitScript(({ side, layoutDelay }) => {
    window.arcSide = side;
    window.arcLayoutDelay = layoutDelay;
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
  }, { side, layoutDelay });
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
      window.arcLastPointer=null;
      document.addEventListener('pointermove',e=>{window.arcLastPointer={x:e.clientX,y:e.clientY};},true);
      window.chrome={storage:{local:{get:async()=>({...arcSettings}),set:async value=>Object.assign(arcSettings,value)},onChanged:{addListener(){},removeListener(){}}},runtime:{id:'test',getURL:path=>location.origin+'/'+path,sendMessage:async message=>{if(message.type==='arc-sidebar-panel-layout'){if(window.arcLayoutDelay)await new Promise(done=>setTimeout(done,window.arcLayoutDelay));return{side:window.arcSide||'right'};}return{open:false};},onMessage:{addListener:fn=>arcTestRuntimeListeners.push(fn),removeListener:fn=>{arcTestRuntimeListeners=arcTestRuntimeListeners.filter(value=>value!==fn);}}}};
      </script>` });
  });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(origin + '/page');
  if (sampleClosed) await page.evaluate(() => {
    window.arcUnexpectedPaints = [];
    const sample = () => {
      const panel = window.arcTestShadow?.querySelector('.panel');
      if (panel && !panel.classList.contains('open')) {
        const style = getComputedStyle(panel), rect = panel.getBoundingClientRect();
        if (style.visibility !== 'hidden' && style.display !== 'none' && Number(style.opacity) > 0 && rect.left < innerWidth - .5 && rect.right > .5) {
          arcUnexpectedPaints.push({ left: rect.left, right: rect.right, visibility: style.visibility });
        }
      }
      requestAnimationFrame(sample);
    };
    requestAnimationFrame(sample);
  });
  await page.addScriptTag({ content: code });
  await page.waitForFunction(() => !!window.arcTestShadow);
  return { context, page, errors, isOpen: () => page.evaluate(() => arcTestShadow.querySelector('.panel').classList.contains('open')) };
}

try {
  // Delay Chrome's layout response beyond first paint. A closed panel must not
  // sweep through the viewport while its initial right position becomes left.
  const beforeFlashFix = execFileSync('git', ['show', '036769edace4c8a945f079d49c62d95b757a05af:src/overlay/overlay.js'], { encoding: 'utf8' });
  const regression = await fixture(beforeFlashFix, 1, { side: 'left', layoutDelay: 180, sampleClosed: true });
  await regression.page.waitForTimeout(450);
  assert.ok((await regression.page.evaluate(() => arcUnexpectedPaints.length)) > 0, 'old version must reproduce a visible closed panel during startup');
  await regression.context.close();
  for (const side of ['left', 'right']) {
    const f = await fixture(source, 1, { side, layoutDelay: 180, sampleClosed: true });
    await f.page.waitForTimeout(450);
    assert.deepEqual(await f.page.evaluate(() => arcUnexpectedPaints), [], `${side} startup never paints the closed panel`);
    assert.equal(await f.page.evaluate(() => arcTestShadow.querySelector('iframe').hasAttribute('src')), false);
    // Check the opposite side with no edge input, then deliberate opening.
    await f.page.evaluate(side => { arcSide = side; window.dispatchEvent(new Event('focus')); }, side === 'left' ? 'right' : 'left');
    await f.page.waitForTimeout(450);
    assert.deepEqual(await f.page.evaluate(() => arcUnexpectedPaints), [], 'changing sides while closed never reveals the panel');
    const edge = await f.page.evaluate(() => {
      const rect = arcTestShadow.querySelector('.edge').getBoundingClientRect();
      return (rect.left + rect.right) / 2;
    });
    await f.page.mouse.move(640, 300); await f.page.mouse.move(edge, 300);
    await f.page.waitForFunction(() => arcTestShadow.querySelector('.panel').classList.contains('open'));
    assert.equal(await f.page.evaluate(() => getComputedStyle(arcTestShadow.querySelector('.panel')).visibility), 'visible');
    assert.deepEqual(f.errors, []);
    await f.context.close();
  }
  console.log('PASS real Chrome: old startup flash reproduced; left/right initialization and closed relocation never paint the panel, deliberate hover still opens it');
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
  // Real press/release input: no click interception, no reopening during a
  // drag, and an editor document remains alive after outside dismissal.
  {
    const f=await fixture(source),{page}=f;
    const edge=await page.evaluate(()=>{const r=arcTestShadow.querySelector('.edge').getBoundingClientRect();return(r.left+r.right)/2;});
    const open=async()=>{await page.mouse.move(640,300);await page.mouse.move(edge,300);await page.waitForFunction(()=>arcTestShadow.querySelector('.panel').classList.contains('open'));};
    await open();
    await page.waitForFunction(()=>!!arcTestShadow.querySelector('iframe').contentDocument?.querySelector('#inside'));
    const frame=page.frames().find(frame=>frame.url().includes('/src/sidepanel/index.html'));
    await frame.evaluate(()=>{const input=document.createElement('input');input.id='draft';input.value='Unsaved editor text';document.body.append(input);parent.postMessage({type:'arc-sidebar-editor-state',open:true},'*');});
    await page.mouse.move(640,330);await page.mouse.down();
    assert.equal(await f.isOpen(),false,'outside press hides immediately, even with an editor open');
    await page.mouse.move(edge,330);await page.waitForTimeout(150);assert.equal(await f.isOpen(),false);
    await page.mouse.up();await page.mouse.move(edge-1,330);await page.waitForTimeout(150);assert.equal(await f.isOpen(),false,'release and jitter cannot reopen');
    const other=await f.context.newPage();await other.goto('about:blank');await page.bringToFront();await other.close();await open();
    assert.equal(await frame.locator('#draft').inputValue(),'Unsaved editor text');
    await frame.evaluate(()=>parent.postMessage({type:'arc-sidebar-editor-state',open:false},'*'));
    await page.mouse.move(640,300);await page.waitForFunction(()=>!arcTestShadow.querySelector('.panel').classList.contains('open'));
    await page.evaluate(()=>{arcSettings.arcSidebarEdgeTrigger={height:20,offset:40,width:10};window.dispatchEvent(new Event('focus'));});
    await page.waitForFunction(()=>arcTestShadow.querySelector('.edge').style.height==='20vh');
    await page.mouse.move(640,100);await page.mouse.move(edge,100);await page.waitForTimeout(150);assert.equal(await f.isOpen(),false,'outside trigger height stays closed');
    await page.mouse.move(edge,400);await page.waitForFunction(()=>arcTestShadow.querySelector('.panel').classList.contains('open'));
    assert.deepEqual(f.errors,[]);await f.context.close();
    console.log('PASS real Chrome: outside pointerdown, drag/release rearming, preserved editor draft, and configurable trigger height');
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
      if (side === 'right') {
        const browserWidth = await page.evaluate(() => innerWidth);
        await page.mouse.move(browserWidth - 1, 300); await page.waitForTimeout(650);
        assert.equal(await f.isOpen(), true, 'moving right onto the native scrollbar retains the sidebar');
        await page.mouse.move(browserWidth, 300); await page.waitForTimeout(650);
        assert.equal(await f.isOpen(), true, 'the exact outer scrollbar boundary also retains the sidebar');
      }
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
      // Chrome may restore the OS cursor instead of the earlier CDP position.
      // Re-send its actual current coordinates, not a deliberate jump to edge.
      const stationary = await page.evaluate(() => arcLastPointer);
      assert.ok(stationary);
      await page.mouse.move(stationary.x, stationary.y); await page.waitForTimeout(150);
      assert.equal(await f.isOpen(), false, 'stationary zero-delta event after return cannot open');
      await other.close(); await open();
      await page.mouse.move(640, 300);
      await page.waitForFunction(() => !arcTestShadow.querySelector('.panel').classList.contains('open'));
      console.log(`PASS real Chrome edge hover: ${side}, DPR ${scale}, zero deltas, scrollbar retention, iframe handoff, stable deadlines, repeated opening and actual tab return`);
    }
    assert.deepEqual(f.errors, []);
    assert.equal(await page.locator('#arc-sidebar-overlay-host').count(), 1);
    await f.context.close();
  }
} finally { await browser.close(); }
