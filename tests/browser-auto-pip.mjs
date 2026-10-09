import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import { execFileSync } from 'node:child_process';
import { chromium } from 'playwright-core';
const executable = ['google-chrome', 'chromium', 'chromium-browser'].map(name => { try { return execFileSync('which',[name],{encoding:'utf8'}).trim(); } catch { return null; } }).find(Boolean);
assert.ok(executable,'Chrome executable required');
const source=fs.readFileSync('src/media/auto-pip.js');
const video=Buffer.from(fs.readFileSync('tests/fixtures/pip-video.webm.b64','utf8'),'base64');
const server=http.createServer((req,res)=>{
 if(req.url==='/video.webm'){res.setHeader('Content-Type','video/webm');res.end(video);return;}
 if(req.url==='/agent.js'){res.setHeader('Content-Type','text/javascript');res.end(source);return;}
 res.setHeader('Content-Type','text/html');
 res.end(`<!doctype html><title>Auto PiP regression</title><video id="video" src="/video.webm" loop controls width="320"></video><button id="play">Play</button><button id="manual">Manual PiP</button><script src="/agent.js"></script><script>
 __arcSidebarAutoPip.configure(true);
 play.onclick=async()=>{await video.play();navigator.mediaSession.playbackState='playing';};
 manual.onclick=()=>video.requestPictureInPicture();
 </script>`);
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const origin=`http://127.0.0.1:${server.address().port}`;
const profile=fs.mkdtempSync(path.join(os.tmpdir(),'arc-pip-'));
fs.mkdirSync(path.join(profile,'Default'));
fs.writeFileSync(path.join(profile,'Default','Preferences'),JSON.stringify({profile:{default_content_setting_values:{automatic_picture_in_picture:1}}}));
let context;
try {
 context=await chromium.launchPersistentContext(profile,{executablePath:executable,headless:false,ignoreDefaultArgs:['--mute-audio'],args:['--no-sandbox','--enable-features=AutoPictureInPictureForVideoPlayback,MediaSessionEnterPictureInPicture']});
 const page=await context.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto(origin);await page.locator('#play').click();await page.waitForFunction(()=>!video.paused&&video.videoWidth>0);
 await page.waitForTimeout(800);
 const other=await context.newPage();await other.goto('about:blank');
 await page.waitForFunction(()=>!!document.pictureInPictureElement,{},{timeout:15000});
 const before=await page.evaluate(()=>video.currentTime);
 await page.bringToFront();await page.waitForFunction(()=>!document.pictureInPictureElement);
 assert.equal(await page.evaluate(()=>video.paused),false);
 assert.ok(await page.evaluate(()=>video.currentTime)>=before);
 console.log('PASS native Chrome: automatic PiP enters on tab switch and returns without pausing');
 await page.locator('#manual').click();await page.waitForFunction(()=>!!document.pictureInPictureElement);
 await other.bringToFront();await page.bringToFront();await page.waitForTimeout(250);
 assert.equal(await page.evaluate(()=>document.pictureInPictureElement===video),true);
 await page.evaluate(()=>document.exitPictureInPicture());
 await page.evaluate(()=>video.pause());await other.bringToFront();await page.waitForTimeout(400);
 assert.equal(await page.evaluate(()=>document.pictureInPictureElement),null);
 assert.deepEqual(errors,[]);
 console.log('PASS native Chrome: manual PiP stays open and paused video does not auto-enter');
} finally {
 await context?.close();await new Promise(resolve=>server.close(resolve));fs.rmSync(profile,{recursive:true,force:true});
}
