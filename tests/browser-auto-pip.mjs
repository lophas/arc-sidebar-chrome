import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { execFileSync } from 'node:child_process';
import { chromium } from 'playwright-core';
const executable = ['google-chrome', 'chromium', 'chromium-browser'].map(name => { try { return execFileSync('which',[name],{encoding:'utf8'}).trim(); } catch { return null; } }).find(Boolean);
assert.ok(executable,'Chrome executable required');
const regressionRef=process.argv.find(arg=>arg.startsWith('--regression-ref='))?.slice('--regression-ref='.length);
const source=regressionRef?execFileSync('git',['show',regressionRef+':src/media/auto-pip.js']):fs.readFileSync('src/media/auto-pip.js');
const video=Buffer.from(fs.readFileSync('tests/fixtures/pip-video.webm.b64','utf8'),'base64');
const profile=fs.mkdtempSync(path.join(os.tmpdir(),'arc-pip-'));
fs.mkdirSync(path.join(profile,'Default'));
fs.writeFileSync(path.join(profile,'Default','Preferences'),JSON.stringify({profile:{default_content_setting_values:{auto_picture_in_picture:1}}}));
// Chrome only starts automatic PiP for HTTPS or file origins, even on localhost.
fs.writeFileSync(path.join(profile,'video.webm'),video);
fs.writeFileSync(path.join(profile,'agent.js'),source);
fs.writeFileSync(path.join(profile,'player.html'),`<!doctype html><title>Auto PiP regression</title>
 <style>#origin{width:960px}#player{width:100%;height:540px}.stale video{visibility:hidden}#placeholder{display:none}.stale #placeholder{display:block}</style>
 <div id="origin"><span id="before">Before</span><div id="player" class="html5-video-player"><video id="video" src="video.webm" loop controls width="320"></video><span id="placeholder">Playing in picture-in-picture</span></div><span id="after">After</span></div>
 <button id="play">Play</button><button id="manual">Manual PiP</button>
 <script>const video=document.getElementById('video'),player=document.getElementById('player');if(location.search.includes('native'))Object.defineProperty(window,'documentPictureInPicture',{value:undefined});</script>
 <script src="agent.js"></script><script>
 window.siteActions=[];
 navigator.mediaSession.setActionHandler('enterpictureinpicture',details=>{siteActions.push(details.enterPictureInPictureReason);video.requestPictureInPicture();});
 player.getVisibilityState=()=>player.classList.contains('stale')?7:0;
 player.setDocumentPictureInPicture=value=>{player.classList.toggle('stale',value);if(value){video.style.width='480px';video.style.height='270px';}};
 player.setSize=()=>{video.style.width=player.parentElement.clientWidth+'px';video.style.height=player.parentElement.clientWidth*9/16+'px';};
 player.setSize();
 video.addEventListener('enterpictureinpicture',()=>player.classList.add('stale'));
 // Model YouTube's stale placeholder after automatic PiP has already closed.
 video.addEventListener('leavepictureinpicture',()=>{if(player.manual)player.classList.remove('stale');});
 __arcSidebarAutoPip.configure(true);
 window.oldActivationAt=Date.now()-1000;
 play.onclick=async()=>{await video.play();navigator.mediaSession.playbackState='playing';};
 manual.onclick=()=>{player.manual=true;video.requestPictureInPicture();};
 </script>`);
const origin=pathToFileURL(path.join(profile,'player.html')).href;
let context;
let diagnostics=[];
let lastPage;
let baselineReproduced=false;
try {
 for(const mode of ['document','native']) {
 // A user-dismissed Auto PiP window changes Chrome's per-origin eligibility.
 // Exercise each implementation in a fresh profile, with explicit tab focus.
 const modeProfile=path.join(profile,mode);
 fs.mkdirSync(path.join(modeProfile,'Default'),{recursive:true});
 fs.writeFileSync(path.join(modeProfile,'Default','Preferences'),JSON.stringify({profile:{default_content_setting_values:{auto_picture_in_picture:1}}}));
 context=await chromium.launchPersistentContext(modeProfile,{executablePath:executable,headless:false,ignoreDefaultArgs:['--mute-audio'],args:['--no-sandbox','--enable-features=AutoPictureInPictureForVideoPlayback,MediaSessionEnterPictureInPicture']});
 const page=await context.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
 lastPage=page;
 const cdp=await context.newCDPSession(page);await cdp.send('Media.enable');
 cdp.on('Media.playerPropertiesChanged',event=>diagnostics.push(event));
 cdp.on('Media.playerErrorsRaised',event=>diagnostics.push(event));
 await page.goto(origin+(mode==='native'?'?native':''));await page.bringToFront();await page.locator('#play').click();await page.waitForFunction(()=>!video.paused&&video.videoWidth>0);
 await page.waitForTimeout(1200);
 const other=await context.newPage();await other.goto('about:blank');await other.bringToFront();
 await page.waitForFunction(()=>!!document.pictureInPictureElement||!!window.documentPictureInPicture?.window,{},{timeout:15000});
 // Replay an old background configuration after Chrome has opened PiP. It
 // contains a formerly active snapshot and must not cause an immediate flash.
 await page.evaluate(()=>__arcSidebarAutoPip.configure(true,false));
 await page.evaluate(()=>__arcSidebarAutoPip.configure(true,true,oldActivationAt));
 await page.waitForTimeout(150);
 assert.equal(await page.evaluate(()=>!!document.pictureInPictureElement||!!window.documentPictureInPicture?.window),true,'queued pre-request activation must not close the new mini player');
 if(mode==='document') {
  assert.equal(await page.evaluate(()=>video.ownerDocument===window.documentPictureInPicture.window.document),true);
  assert.equal(await page.evaluate(()=>player.ownerDocument===video.ownerDocument),true);
  assert.equal(await page.evaluate(()=>video.ownerDocument.defaultView.getComputedStyle(video).visibility),'visible');
 }
 const frames=await page.evaluate(()=>video.getVideoPlaybackQuality().totalVideoFrames);
 await page.waitForFunction(previous=>video.getVideoPlaybackQuality().totalVideoFrames>previous,frames);
 await page.bringToFront();await page.waitForFunction(()=>!document.pictureInPictureElement);
 await page.waitForFunction(()=>!window.documentPictureInPicture?.window);
 assert.equal(await page.evaluate(()=>video.ownerDocument===document&&document.getElementById('video')===video),true);
 assert.deepEqual(await page.evaluate(()=>[player.parentNode.id,player.previousElementSibling.id,player.nextElementSibling.id]),['origin','before','after']);
 await page.waitForFunction(()=>player.getVisibilityState()===0&&getComputedStyle(video).visibility==='visible');
 assert.equal(await page.locator('#placeholder').isVisible(),false);
 assert.equal(await page.evaluate(()=>video.getBoundingClientRect().width),960,'returned inline player must fill its original container, not stay at PiP width');
 assert.deepEqual(await page.evaluate(()=>siteActions),[]);
 assert.equal(await page.evaluate(()=>video.paused),false);
 assert.ok(await page.evaluate(()=>video.currentTime)>0);
 console.log('PASS native Chrome '+mode+' PiP: same live player returns to the exact DOM slot, visible and playing, without invoking the site manual handler');
 if(mode==='document') {
  await other.bringToFront();await page.waitForFunction(()=>!!window.documentPictureInPicture?.window);
  // Closing the window itself must return the DOM before the PiP document dies.
  await page.evaluate(()=>window.documentPictureInPicture.window.close());
  await page.waitForFunction(()=>video.ownerDocument===document&&player.parentNode.id==='origin');
  assert.equal(await page.evaluate(()=>video.paused),false);
  await page.bringToFront();
 }
 await page.locator('#manual').click();await page.waitForFunction(()=>!!document.pictureInPictureElement);
 await other.bringToFront();await page.bringToFront();await page.waitForTimeout(250);
 assert.equal(await page.evaluate(()=>document.pictureInPictureElement===video),true);
 await page.evaluate(()=>document.exitPictureInPicture());
 await page.evaluate(()=>video.pause());await other.bringToFront();await page.waitForTimeout(400);
 assert.equal(await page.evaluate(()=>document.pictureInPictureElement),null);
 assert.deepEqual(errors,[]);
 console.log('PASS native Chrome: manual PiP stays open and paused video does not auto-enter');
 await other.close();await page.close();
 await context.close();context=null;
 }
} catch(error) {
 if(regressionRef&&error instanceof assert.AssertionError&&error.message.includes('queued pre-request activation must not close the new mini player')) {
  baselineReproduced=true;
  console.log('PASS native Chrome: previous controller reproduces immediate PiP closure from a queued activation');
 } else {
 console.error('Auto PiP state:',await lastPage?.evaluate(()=>({...__arcSidebarAutoPip.getState(),hidden:document.hidden,siteActions,videoDocument:video.ownerDocument.URL,paused:video.paused})));
 console.error('Native PiP diagnostics:',JSON.stringify(diagnostics));
 throw error;
 }
} finally {
 await context?.close();fs.rmSync(profile,{recursive:true,force:true});
}
if(regressionRef)assert.equal(baselineReproduced,true,'known-bad controller must reproduce the queued-activation closure');
