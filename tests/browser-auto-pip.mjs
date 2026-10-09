import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { execFileSync } from 'node:child_process';
import { chromium } from 'playwright-core';
const executable = ['google-chrome', 'chromium', 'chromium-browser'].map(name => { try { return execFileSync('which',[name],{encoding:'utf8'}).trim(); } catch { return null; } }).find(Boolean);
assert.ok(executable,'Chrome executable required');
const source=fs.readFileSync('src/media/auto-pip.js');
const video=Buffer.from(fs.readFileSync('tests/fixtures/pip-video.webm.b64','utf8'),'base64');
const profile=fs.mkdtempSync(path.join(os.tmpdir(),'arc-pip-'));
fs.mkdirSync(path.join(profile,'Default'));
fs.writeFileSync(path.join(profile,'Default','Preferences'),JSON.stringify({profile:{default_content_setting_values:{auto_picture_in_picture:1}}}));
// Chrome only starts automatic PiP for HTTPS or file origins, even on localhost.
fs.writeFileSync(path.join(profile,'video.webm'),video);
fs.writeFileSync(path.join(profile,'agent.js'),source);
fs.writeFileSync(path.join(profile,'player.html'),`<!doctype html><title>Auto PiP regression</title>
 <style>.stale video{visibility:hidden}#placeholder{display:none}.stale #placeholder{display:block}</style>
 <div id="player" class="html5-video-player"><video id="video" src="video.webm" loop controls width="320"></video><span id="placeholder">Playing in picture-in-picture</span></div>
 <button id="play">Play</button><button id="manual">Manual PiP</button><script src="agent.js"></script><script>
 window.siteActions=[];
 navigator.mediaSession.setActionHandler('enterpictureinpicture',details=>{siteActions.push(details.enterPictureInPictureReason);video.requestPictureInPicture();});
 player.getVisibilityState=()=>player.classList.contains('stale')?7:0;
 player.setDocumentPictureInPicture=value=>player.classList.toggle('stale',value);
 video.addEventListener('enterpictureinpicture',()=>player.classList.add('stale'));
 // Model YouTube's stale placeholder after automatic PiP has already closed.
 video.addEventListener('leavepictureinpicture',()=>{if(player.manual)player.classList.remove('stale');});
 __arcSidebarAutoPip.configure(true);
 play.onclick=async()=>{await video.play();navigator.mediaSession.playbackState='playing';};
 manual.onclick=()=>{player.manual=true;video.requestPictureInPicture();};
 </script>`);
const origin=pathToFileURL(path.join(profile,'player.html')).href;
let context;
let diagnostics=[];
try {
 context=await chromium.launchPersistentContext(profile,{executablePath:executable,headless:false,ignoreDefaultArgs:['--mute-audio'],args:['--no-sandbox','--enable-features=AutoPictureInPictureForVideoPlayback,MediaSessionEnterPictureInPicture']});
 const page=await context.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
 const cdp=await context.newCDPSession(page);await cdp.send('Media.enable');
 cdp.on('Media.playerPropertiesChanged',event=>diagnostics.push(event));
 cdp.on('Media.playerErrorsRaised',event=>diagnostics.push(event));
 await page.goto(origin);await page.locator('#play').click();await page.waitForFunction(()=>!video.paused&&video.videoWidth>0);
 await page.waitForTimeout(1200);
 const other=await context.newPage();await other.goto('about:blank');
 await page.waitForFunction(()=>!!document.pictureInPictureElement,{},{timeout:15000});
 await page.bringToFront();await page.waitForFunction(()=>!document.pictureInPictureElement);
 await page.waitForFunction(()=>player.getVisibilityState()===0&&getComputedStyle(video).visibility==='visible');
 assert.equal(await page.locator('#placeholder').isVisible(),false);
 assert.deepEqual(await page.evaluate(()=>siteActions),[]);
 assert.equal(await page.evaluate(()=>video.paused),false);
 assert.ok(await page.evaluate(()=>video.currentTime)>0);
 console.log('PASS native Chrome: automatic PiP returns the visible video, clears stale player UI and never invokes the site manual handler');
 await page.locator('#manual').click();await page.waitForFunction(()=>!!document.pictureInPictureElement);
 await other.bringToFront();await page.bringToFront();await page.waitForTimeout(250);
 assert.equal(await page.evaluate(()=>document.pictureInPictureElement===video),true);
 await page.evaluate(()=>document.exitPictureInPicture());
 await page.evaluate(()=>video.pause());await other.bringToFront();await page.waitForTimeout(400);
 assert.equal(await page.evaluate(()=>document.pictureInPictureElement),null);
 assert.deepEqual(errors,[]);
 console.log('PASS native Chrome: manual PiP stays open and paused video does not auto-enter');
} catch(error) {
 console.error('Native PiP diagnostics:',JSON.stringify(diagnostics));
 throw error;
} finally {
 await context?.close();fs.rmSync(profile,{recursive:true,force:true});
}
