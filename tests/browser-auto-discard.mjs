import assert from 'node:assert/strict';
import { cp, mkdtemp, rm, readFile, appendFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createServer } from 'node:http';
import { chromium } from 'playwright-core';

const video = Buffer.from(await readFile('tests/fixtures/pip-video.webm.b64', 'utf8'), 'base64');
let origin;
const loads = new Map();
const server = createServer((req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  if (req.url === '/video.webm') { res.setHeader('Content-Type', 'video/webm'); res.end(video); return; }
  loads.set(req.url, (loads.get(req.url) || 0) + 1);
  res.setHeader('Content-Type', 'text/html');
  let body = '<form id="form"><input id="input"><textarea id="draft"></textarea><button type="reset">Reset</button></form>';
  if (req.url === '/video' || req.url === '/pip') body += '<video id="video" muted loop src="/video.webm"></video><button id="play" onclick="video.play()">Play</button><button id="pip" onclick="video.requestPictureInPicture()">PiP</button>';
  if (req.url === '/framed') body += '<iframe src="/child"></iframe>';
  res.end('<!doctype html><title>Discard ' + req.url + '</title>' + body);
});
await new Promise(done => server.listen(0, '127.0.0.1', done));
origin = `http://127.0.0.1:${server.address().port}`;
const directory = await mkdtemp(join(tmpdir(), 'arc-discard-extension-'));
let context;
try {
  await cp('src', join(directory, 'src'), { recursive: true }); await cp('manifest.json', join(directory, 'manifest.json'));
  await appendFile(join(directory, 'src/background/service-worker.js'), "\nimport { createDiscardController as discardTestFactory } from './discard-controller.js'; globalThis.discardTestFactory = discardTestFactory;\n");
  context = await chromium.launchPersistentContext('', { channel: 'chromium', headless: false, acceptDownloads: true, ignoreDefaultArgs: ['--disable-extensions'], args: ['--no-sandbox', '--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream', `--disable-extensions-except=${directory}`, `--load-extension=${directory}`] });
  let [worker] = context.serviceWorkers(); if (!worker) worker = await context.waitForEvent('serviceworker');
  const extensionOrigin = 'chrome-extension://' + worker.url().split('/')[2];
  context.browser().on('disconnected', () => console.log('Discard test browser disconnected'));
  context.on('page', page => page.on('close', () => console.log('Discard test page closed:', page.url())));
  const options = await context.newPage(); await options.goto(extensionOrigin + '/src/options/index.html');
  const poll = async (fn, message) => {
    for (let i = 0; i < 160; i++) { if (await fn()) return; await new Promise(done => setTimeout(done, 50)); }
    assert.fail(message);
  };
  await poll(() => options.locator('#autoDiscardValue').textContent().then(text => text === '30 min'), 'Default must be 30 minutes');
  const slider = options.locator('#autoDiscardMinutes');
  assert.equal(await slider.getAttribute('min'), '0'); assert.equal(await slider.getAttribute('max'), '120'); assert.equal(await slider.getAttribute('step'), '5');
  await slider.focus(); await options.keyboard.press('Home');
  await poll(() => options.evaluate(async () => (await chrome.storage.local.get('arcSidebarAutoDiscardMinutes')).arcSidebarAutoDiscardMinutes === 0), 'Disabled value must persist');
  await poll(() => options.evaluate(async () => !(await chrome.alarms.get('arc-sidebar-auto-discard'))), 'Disabled must remove its alarm');
  await options.locator('#autoDiscardExceptions').fill('https://MEET.example.com/call\n*.docs.example.com');
  await options.locator('#saveDiscardExceptions').click();
  await poll(() => options.evaluate(async () => (await chrome.storage.local.get('arcSidebarAutoDiscardExceptions')).arcSidebarAutoDiscardExceptions?.join(',') === 'docs.example.com,meet.example.com'), 'Domain exceptions must persist canonically');
  await slider.focus(); await options.keyboard.press('ArrowRight');
  await poll(() => options.evaluate(async () => (await chrome.storage.local.get('arcSidebarAutoDiscardMinutes')).arcSidebarAutoDiscardMinutes === 5), 'Five-minute step must save');
  await options.evaluate(() => chrome.storage.local.set({ arcSidebarMode: 'native', arcSidebarAutoPipEnabled: false }));
  console.log('PASS real extension: default 30, 0=disabled without alarm, five-minute slider steps and local domain exceptions');

  const pages = {};
  for (const path of ['ordinary', 'edited', 'protected', 'pinned', 'video', 'pip', 'capture', 'framed', 'legacy']) {
    const page = await context.newPage(); await page.goto(origin + '/' + path); pages[path] = page;
  }
  await pages.edited.bringToFront(); await pages.edited.locator('#draft').fill('unsaved draft');
  // A controlled input may mirror its new value into defaultValue. The trusted
  // input guard must still remember the edit.
  await pages.edited.evaluate(() => { draft.defaultValue = draft.value; });
  await pages.video.bringToFront(); await pages.video.locator('#play').click();
  await pages.video.waitForFunction(() => !video.paused);
  await pages.pip.bringToFront(); await pages.pip.locator('#play').click(); await pages.pip.locator('#pip').click();
  await pages.pip.waitForFunction(() => !!document.pictureInPictureElement);
  await pages.capture.evaluate(async () => { window.stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: true }); });
  await pages.framed.frameLocator('iframe').locator('#draft').fill('iframe draft');
  await pages.legacy.evaluate(() => { delete window.__arcSidebarDiscardGuard; });
  await pages.ordinary.evaluate(url => new Promise(done => {
    const frame = document.createElement('iframe'); frame.src = url; frame.onload = done;
    frame.style.cssText = 'width:390px;height:500px'; document.body.append(frame);
  }), extensionOrigin + '/src/sidepanel/index.html?overlay=1');
  await options.bringToFront();
  const ids = await options.evaluate(async origin => {
    const tabs = await chrome.tabs.query({});
    const ids = Object.fromEntries(tabs.filter(tab => tab.url?.startsWith(origin + '/')).map(tab => [new URL(tab.url).pathname.slice(1), tab.id]));
    await chrome.tabs.update(ids.protected, { autoDiscardable: false });
    await chrome.tabs.update(ids.pinned, { pinned: true });
    const groupId = await chrome.tabs.group({ tabIds: [ids.ordinary] });
    const { arcSidebarModel: model } = await chrome.storage.local.get('arcSidebarModel');
    model.spaces[0].children.push({ id: 'ordinary', type: 'tab', title: 'Idle example', url: origin + '/ordinary' });
    model.stats.tabs++;
    await chrome.storage.local.set({ arcSidebarModel: model });
    await chrome.tabGroups.update(groupId, { title: model.spaces[0].title, color: 'grey' });
    await chrome.storage.session.set({ arcSidebarBindings: { ordinary: ids.ordinary } });
    return { ...ids, groupId };
  }, origin);
  await worker.evaluate(async () => {
    let time = Date.now(), session = {}, alarms = new Map();
    self.discardTrace = [];
    const api = { runtime: chrome.runtime, tabs: { query: query => chrome.tabs.query(query), get: id => chrome.tabs.get(id),
      discard: async id => { discardTrace.push({ id, url: (await chrome.tabs.get(id)).url }); return chrome.tabs.discard(id); } }, scripting: chrome.scripting,
      storage: { local: chrome.storage.local, session: {
        get: async key => ({ [key]: session[key] }), set: async values => Object.assign(session, structuredClone(values))
      } }, alarms: { get: async name => alarms.get(name), clear: async name => alarms.delete(name), create: async (name, info) => alarms.set(name, { scheduledTime: info.when }) } };
    self.discardTest = { controller: discardTestFactory(api, () => time), advance: ms => time += ms, session, alarms };
    await discardTest.controller.start();
  });
  console.log('Discarded via real worker:', JSON.stringify(await worker.evaluate(async () => { discardTest.advance(5 * 60000); await discardTest.controller.alarm(); return discardTrace; })));
  const states = await options.evaluate(async ids => Object.fromEntries(await Promise.all(Object.entries(ids).filter(([key]) => key !== 'groupId').map(async ([key, id]) => [key, (await chrome.tabs.get(id)).discarded]))), ids);
  assert.equal(states.ordinary, true, 'The eligible idle tab must really be unloaded by Chrome');
  for (const path of ['edited', 'protected', 'pinned', 'video', 'pip', 'capture', 'framed', 'legacy']) assert.equal(states[path], false, path + ' must be protected');
  assert.equal(await options.evaluate(id => chrome.tabs.get(id).then(tab => tab.groupId), ids.ordinary), ids.groupId);
  assert.equal(await options.evaluate(async () => (await chrome.storage.session.get('arcSidebarBindings')).arcSidebarBindings.ordinary), ids.ordinary);
  const before = loads.get('/ordinary');
  await options.evaluate(id => chrome.tabs.update(id, { active: true }), ids.ordinary);
  await poll(() => options.evaluate(id => chrome.tabs.get(id).then(tab => !tab.discarded && tab.status === 'complete'), ids.ordinary), 'Activating must reload the existing tab');
  assert.ok(loads.get('/ordinary') > before);
  console.log('PASS real Chrome: actual idle discard/reload keeps tab ID, native group and saved binding; edits, iframe edits, media, native PiP, live camera/microphone, native pinned and manual protection survive');

  await options.bringToFront();
  const downloadPromise = options.waitForEvent('download'); await options.locator('#downloadBackup').click();
  const backup = JSON.parse(await readFile(await (await downloadPromise).path(), 'utf8'));
  assert.deepEqual(backup.settings.autoDiscard, { minutes: 5, exceptions: ['docs.example.com', 'meet.example.com'] });
  await options.evaluate(() => chrome.storage.local.set({ arcSidebarAutoDiscardMinutes: 0, arcSidebarAutoDiscardExceptions: [] }));
  await options.locator('#restoreBackup').setInputFiles({ name: 'discard-backup.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(backup)) });
  await poll(() => options.evaluate(async () => (await chrome.storage.local.get('arcSidebarAutoDiscardMinutes')).arcSidebarAutoDiscardMinutes === 5), 'Backup must restore the discard timeout');
  assert.deepEqual(await options.evaluate(async () => (await chrome.storage.local.get('arcSidebarAutoDiscardExceptions')).arcSidebarAutoDiscardExceptions), ['docs.example.com', 'meet.example.com']);
  const synced = await options.evaluate(() => chrome.storage.sync.get(null));
  assert.equal(Object.keys(synced).some(key => /AutoDiscard/.test(key)), false);
  console.log('PASS real extension: discard settings and website exceptions round-trip through backup and remain outside Chrome Sync');
} finally {
  await context?.close(); await new Promise(done => server.close(done)); await rm(directory, { recursive: true, force: true });
}
