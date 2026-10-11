import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { execFileSync } from 'node:child_process';
import { chromium } from 'playwright-core';
const executable = ['google-chrome', 'chromium', 'chromium-browser'].map(name => { try { return execFileSync('which', [name], { encoding: 'utf8' }).trim(); } catch { return null; } }).find(Boolean);
assert.ok(executable, 'Chrome executable required');
const baseURL = 'https://example.com/arc-pip-test/';
const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'arc-html5-pip-'));
const video = '<video id="video" src="video.webm" loop controls width="320"></video><button id="play">Play</button><button id="manual">Manual PiP</button>';
const controls = '<script>play.onclick=()=>video.play();manual.onclick=()=>video.requestPictureInPicture();</script>';
fs.writeFileSync(path.join(directory, 'video.webm'), Buffer.from(fs.readFileSync('tests/fixtures/pip-video.webm.b64', 'utf8'), 'base64'));
fs.copyFileSync('src/media/auto-pip.js', path.join(directory, 'agent.js'));
fs.writeFileSync(path.join(directory, 'embedded.html'), '<!doctype html>'+video+controls);
fs.writeFileSync(path.join(directory, 'nested.html'), '<!doctype html><iframe src="embedded.html" allow="picture-in-picture"></iframe>');
let context;
try {
  for (const mode of ['ordinary', 'shadow', 'embedded', 'nested']) {
    const profile = path.join(directory, mode);
    fs.mkdirSync(path.join(profile, 'Default'), { recursive: true });
    fs.writeFileSync(path.join(profile, 'Default', 'Preferences'), JSON.stringify({ profile: { default_content_setting_values: { auto_picture_in_picture: 1 } } }));
    let markup = video+controls;
    if (mode === 'shadow') markup = `<div id="host"></div><script>const root=host.attachShadow({mode:'open'});root.innerHTML=${JSON.stringify(video)};const video=root.querySelector('video');root.querySelector('#play').onclick=()=>video.play();root.querySelector('#manual').onclick=()=>video.requestPictureInPicture();</script>`;
    if (mode === 'embedded' || mode === 'nested') markup = `<iframe src="${mode === 'nested' ? 'nested' : 'embedded'}.html" allow="picture-in-picture"></iframe>`;
    fs.writeFileSync(path.join(directory, 'player.html'), '<!doctype html><title>Generic HTML5 PiP</title><script src="agent.js"></script>'+markup+'<script>__arcSidebarAutoPip.configure(true);</script>');
    context = await chromium.launchPersistentContext(profile, { executablePath: executable, headless: false, ignoreDefaultArgs: ['--mute-audio'], args: ['--no-sandbox', '--allow-file-access-from-files', '--enable-features=AutoPictureInPictureForVideoPlayback,MediaSessionEnterPictureInPicture'] });
    await context.route(baseURL+'**', async route => {
      const name = path.basename(new URL(route.request().url()).pathname);
      const type = name.endsWith('.js') ? 'text/javascript' : name.endsWith('.webm') ? 'video/webm' : 'text/html';
      await route.fulfill({ status: 200, contentType: type, body: fs.readFileSync(path.join(directory, name)) });
    });
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.goto(mode === 'embedded' || mode === 'nested' ? baseURL+'player.html' : pathToFileURL(path.join(directory, 'player.html')).href);
    await page.bringToFront();
    let frame = page.mainFrame();
    if (mode === 'embedded' || mode === 'nested') {
      await page.waitForFunction(mode => { let doc=document.querySelector('iframe').contentDocument;if(mode==='nested')doc=doc?.querySelector('iframe')?.contentDocument;return !!doc?.querySelector('video'); }, mode);
      frame = page.frames().find(frame => frame.url().endsWith('/embedded.html'));
      assert.ok(frame, 'loaded embedded video frame');
    }
    await frame.locator('#play').click();
    await frame.waitForFunction(() => { const video=document.querySelector('video')||document.getElementById('host')?.shadowRoot.querySelector('video');return !video.paused&&video.videoWidth>0; });
    await page.waitForTimeout(1200);
    const previous = await frame.evaluate(() => { const video=document.querySelector('video')||document.getElementById('host')?.shadowRoot.querySelector('video');window.originalVideo=video;window.originalParent=video.parentNode;return video.getVideoPlaybackQuality().totalVideoFrames; });
    const other = await context.newPage();
    await other.goto('about:blank');await other.bringToFront();
    try { await page.waitForFunction(() => __arcSidebarAutoPip.getState().player === 'video', {}, { timeout: 15000 }); }
    catch (error) { console.error(mode, await page.evaluate(() => __arcSidebarAutoPip.getState()));console.error('Frame PiP support:',await frame.evaluate(()=>({enabled:document.pictureInPictureEnabled,active:navigator.userActivation.isActive,origin:location.origin}))); throw error; }
    await page.evaluate(() => __arcSidebarAutoPip.configure(true, false));
    await page.evaluate(() => __arcSidebarAutoPip.configure(true, true, Date.now()-10000));
    await page.waitForTimeout(200);
    assert.equal(await page.evaluate(() => __arcSidebarAutoPip.getState().player), 'video');
    assert.equal(await page.evaluate(() => !!window.documentPictureInPicture?.window), false, 'generic videos must use native PiP without DOM adoption');
    assert.equal(await frame.evaluate(() => originalVideo.parentNode === originalParent && originalVideo.ownerDocument === document), true);
    await frame.waitForFunction(previous => originalVideo.getVideoPlaybackQuality().totalVideoFrames > previous, previous);
    await page.bringToFront();
    await page.waitForFunction(() => __arcSidebarAutoPip.getState().player === 'none');
    assert.equal(await frame.evaluate(() => originalVideo.paused), false);
    assert.equal(await frame.evaluate(() => originalVideo.parentNode === originalParent), true);
    // User-owned PiP must survive returning to the source tab.
    await frame.locator('#manual').click();
    await other.bringToFront();await page.bringToFront();
    await page.evaluate(() => __arcSidebarAutoPip.configure(true, true, Date.now()));
    await page.waitForTimeout(200);
    assert.equal(await frame.evaluate(() => (originalVideo.getRootNode().pictureInPictureElement || document.pictureInPictureElement) === originalVideo), true);
    await frame.evaluate(() => document.exitPictureInPicture());
    await frame.evaluate(() => originalVideo.pause());
    await other.bringToFront();await page.waitForTimeout(400);
    assert.equal(await page.evaluate(() => __arcSidebarAutoPip.getState().player), 'none');
    assert.deepEqual(errors, []);
    console.log('PASS native Chrome HTML5 '+mode+': automatic PiP, uninterrupted playback, exact DOM retained, manual PiP preserved');
    await context.close();context = null;
  }
} finally { await context?.close();fs.rmSync(directory, { recursive: true, force: true }); }
