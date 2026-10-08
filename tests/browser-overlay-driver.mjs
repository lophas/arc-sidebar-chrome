import assert from 'node:assert/strict';
import { chromium } from 'playwright-core';
const [executablePath, url] = process.argv.slice(2);
const browser = await chromium.launch({ executablePath, headless: true, args: ['--no-sandbox'] });
try {
  const page = await browser.newPage();
  await page.addInitScript(()=>{const attach=Element.prototype.attachShadow;Element.prototype.attachShadow=function(options){const root=attach.call(this,options);if(this.id==='arc-sidebar-overlay-host')window.arcTestShadow=root;return root;};});
  await page.goto(url, { waitUntil: 'load', timeout: 10000 });
  await page.waitForSelector('#result', { timeout: 5000 });
  const result = await page.locator('#result').textContent();
  if (result.startsWith('PASS') && new URL(url).searchParams.get('mode') === 'overlay') {
    const report = open => page.evaluate(open=>{const frame=arcTestShadow.querySelector('iframe');window.dispatchEvent(new MessageEvent('message',{source:frame.contentWindow,data:{type:'arc-sidebar-editor-state',open}}));},open);
    const isOpen = () => page.evaluate(()=>arcTestShadow.querySelector('.panel').classList.contains('open'));
    const hover = () => page.evaluate(()=>arcTestShadow.querySelector('.edge').dispatchEvent(new MouseEvent('mouseenter')));
    await report(true);assert.equal(await isOpen(),false,'stale editor signal must not open a closed panel');
    await hover();await page.waitForFunction(()=>arcTestShadow.querySelector('.panel').classList.contains('open'));
    await report(true);
    await page.evaluate(()=>{window.arcTestVisibility='hidden';Object.defineProperty(document,'visibilityState',{configurable:true,get:()=>window.arcTestVisibility});document.dispatchEvent(new Event('visibilitychange'));});
    assert.equal(await isOpen(),false);
    assert.equal(await page.evaluate(()=>arcTestShadow.querySelector('iframe').hasAttribute('src')),true,'editor iframe survives hidden state');
    await page.evaluate(()=>{window.arcTestVisibility='visible';document.dispatchEvent(new Event('visibilitychange'));window.dispatchEvent(new Event('focus'));});
    await page.waitForTimeout(150);assert.equal(await isOpen(),false,'returning tab stays closed until hover');
    await hover();await page.waitForFunction(()=>arcTestShadow.querySelector('.panel').classList.contains('open'));
    await report(false);await page.waitForFunction(()=>!arcTestShadow.querySelector('.panel').classList.contains('open'));
    await page.evaluate(()=>{window.arcTestSide='left';window.dispatchEvent(new Event('focus'));});
    await page.mouse.move(1190,300);await page.waitForTimeout(120);
    assert.equal(await isOpen(),false,'right edge must not open the left sidebar');
    await page.mouse.move(1,300);await page.waitForFunction(()=>arcTestShadow.querySelector('.panel').classList.contains('open'));
    await page.waitForTimeout(200);
    const geometry=await page.evaluate(()=>{
      const panel=arcTestShadow.querySelector('.panel').getBoundingClientRect();
      const edge=arcTestShadow.querySelector('.edge').getBoundingClientRect();
      const handle=arcTestShadow.querySelector('.resize-handle').getBoundingClientRect();
      return {left:panel.left,width:panel.width,edge:edge.left,handle:handle.left};
    });
    assert.equal(geometry.left,0);assert.equal(geometry.edge,0);
    assert.ok(Math.abs(geometry.handle-(geometry.width-7))<=1);
    await page.mouse.move(700,300);await page.waitForFunction(()=>!arcTestShadow.querySelector('.panel').classList.contains('open'));
    console.log('PASS real Chromium: left edge and sidebar geometry, opposite edge ignored, leave closes');
    console.log('PASS real Chromium: editor messages cannot open closed panels; hidden/returned tabs require fresh hover and retain editor contents');
  }
  console.log(result);
  if (!result.startsWith('PASS ')) process.exitCode = 1;
} finally {
  await browser.close();
}
