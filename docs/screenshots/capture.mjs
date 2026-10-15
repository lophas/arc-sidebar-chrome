// Real installed extension and native Chrome UI; fictional workspace/site data.
// Run under Xvfb with a 1280x900 desktop. Production UI is never substituted.
import assert from 'node:assert/strict';
import { readFile, writeFile, mkdir, mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { execFileSync } from 'node:child_process';
import { chromium } from 'playwright-core';

const output = 'docs/screenshots';
const temporary = await mkdtemp(join(tmpdir(), 'arc-readme-'));
const version = JSON.parse(await readFile('manifest.json', 'utf8')).version;
const icons = new Map();
await Promise.all(['mail.google.com','github.com','calendar.google.com','notion.so','docs.google.com','figma.com','linear.app','developer.mozilla.org'].map(async domain => {
  try {
    const r = await fetch(`https://www.google.com/s2/favicons?domain=${domain}&sz=64`, { signal: AbortSignal.timeout(10000) });
    if (r.ok) icons.set(domain, `data:image/png;base64,${Buffer.from(await r.arrayBuffer()).toString('base64')}`);
  } catch {}
}));
const fallback = 'data:image/svg+xml,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><rect width="32" height="32" rx="8" fill="#4679d8"/><path d="M9 23V12a7 7 0 0 1 14 0v11" fill="none" stroke="white" stroke-width="4"/></svg>');
const link = (id,title,url) => ({ id,type:'tab',title,url,icon:icons.get(new URL(url).hostname)||fallback });
const model = { version:2, favorites:[
  link('mail','Gmail','https://mail.google.com/mail/u/0/'),link('github','GitHub','https://github.com/'),
  link('calendar','Calendar','https://calendar.google.com/'),link('notion','Notion','https://notion.so/')
], spaces:[
  { id:'work',title:'Work',emoji:'💼',palette:{kind:'preset',id:'blue'},children:[
    link('dashboard','Project dashboard','https://linear.app/northstar'),
    {id:'project',type:'folder',title:'Website launch',children:[link('brief','Project brief','https://docs.google.com/document/northstar'),link('design','Design files','https://figma.com/design/northstar'),link('repo','Source code','https://github.com/lophas/arc-sidebar-chrome')]},
    {id:'resources',type:'folder',title:'Reference library',children:[link('mdn','MDN Web Docs','https://developer.mozilla.org/'),link('a11y','Accessibility checklist','https://developer.mozilla.org/en-US/docs/Web/Accessibility')]},
    link('roadmap','Product roadmap','https://notion.so/northstar-roadmap')
  ]},
  { id:'personal',title:'Personal',emoji:'🏡',palette:{kind:'preset',id:'green'},children:[
    link('weekend','Weekend plans','https://notion.so/weekend'),
    {id:'travel',type:'folder',title:'Next adventure',children:[link('trip','Summer itinerary','https://docs.google.com/document/itinerary'),link('packing','Packing list','https://notion.so/packing')]},
    link('recipes','Recipes to try','https://notion.so/recipes')
  ]},
  { id:'reading',title:'Reading',emoji:'📚',palette:{kind:'preset',id:'purple'},children:[
    link('article','Designing for focus','https://notes.example.test/designing-for-focus'),
    {id:'later',type:'folder',title:'Read this weekend',children:[link('interfaces','What makes a great interface?','https://notes.example.test/interfaces'),link('workflows','Small habits, better workflows','https://notes.example.test/workflows')]}
  ]}
], stats:{spaces:3,favorites:4,folders:4,tabs:14} };
const titles = new Map();
function index(nodes) { for(const node of nodes){if(node.url)titles.set(node.url,node.title);if(node.children)index(node.children);} }
index(model.favorites);for(const space of model.spaces)index(space.children);
titles.set('https://github.com/lophas/arc-sidebar-chrome/pull/42','Review · navigation polish');
titles.set('https://notes.example.test/tomorrow','Notes for tomorrow');

function website(url) {
  const title=titles.get(url)||'A little more focus',video=url.startsWith('https://video.example.test/');
  const favicon=icons.get(new URL(url).hostname)||fallback;
  return `<!doctype html><html><head><meta charset="utf-8"><title>${title}</title><link rel="icon" href="${favicon}"><style>
  *{box-sizing:border-box}body{margin:0;background:#f4f5f8;color:#20283b;font:15px/1.65 Arial,sans-serif}nav{height:68px;background:white;border-bottom:1px solid #e3e7ee;display:flex;align-items:center;padding:0 42px;gap:30px;color:#788398;font-size:13px}nav b{font-size:17px;letter-spacing:2px;color:#273b59;margin-right:auto}nav span:first-of-type{color:#376aca}main{max-width:790px;padding:48px 44px;margin:auto}.eyebrow{color:#4773be;font-size:11px;letter-spacing:2px;font-weight:bold}h1{font-size:40px;line-height:1.15;letter-spacing:-1.4px;margin:15px 0 18px}p{color:#68748a}.meta{font-size:12px;color:#8a93a4;display:flex;gap:18px;margin:22px 0 30px}.banner{background:linear-gradient(120deg,#183d65,#397e9c);border-radius:18px;height:155px;padding:24px 28px;color:white;position:relative;overflow:hidden}.banner:after{content:'';position:absolute;width:210px;height:210px;border:25px solid #ffffff18;border-radius:50%;right:5px;top:-25px}.banner small{letter-spacing:2px;font-size:10px;color:#c4dbec}.banner strong{display:block;font-size:27px;line-height:1.3;margin-top:13px}.columns{display:grid;grid-template-columns:1.3fr 1fr;gap:24px;margin-top:28px}.card{background:white;border:1px solid #e1e6ef;border-radius:12px;padding:21px}.card h2{font-size:16px;margin:0 0 14px}.item{padding:9px 0;border-bottom:1px solid #edf0f5;font-size:13px}.item:last-child{border:0}.check{display:inline-flex;align-items:center;justify-content:center;width:17px;height:17px;border:1px solid #aec2df;border-radius:5px;margin-right:9px;color:#4773be;font-size:11px}.tag{background:#eaf1fc;padding:4px 8px;border-radius:5px;font-size:10px;color:#5278b6}video{width:100%;aspect-ratio:16/9;display:block;background:#0d1830;border-radius:14px}button{background:#3265bd;border:0;color:white;padding:12px 22px;border-radius:8px;cursor:pointer;margin-top:15px;font-weight:bold}
  </style></head><body><nav><b>NORTHSTAR</b><span>Workspace</span><span>Projects</span><span>Notes</span><span>JS</span></nav><main><div class="eyebrow">${video?'FOCUS SESSIONS':'NORTHSTAR / WEBSITE LAUNCH'}</div><h1>${title}</h1><p>${video?'A short demo video. Keep watching while you get back to your work.':'One clear place for the plan, the decisions and the next step.'}</p><div class="meta"><span>Website launch</span><span>Updated today</span><span class="tag">In progress</span></div>
  ${video?'<video id="video" controls loop></video><button id="play">Play demo video</button><canvas id="source" width="960" height="540" hidden></canvas>':'<div class="banner"><small>THIS WEEK’S FOCUS</small><strong>Make room for<br>the work that matters.</strong></div><div class="columns"><section class="card"><h2>Next steps</h2><div class="item"><span class="check">✓</span>Align on the project brief</div><div class="item"><span class="check">✓</span>Organize the reference library</div><div class="item"><span class="check"></span>Review the latest designs</div><div class="item"><span class="check"></span>Share the launch checklist</div></section><section class="card"><h2>Project notes</h2><p style="font-size:13px">Keep the essentials close.<br>Follow one project at a time.<br>Leave room for a fresh idea.</p><span class="tag">Ready for review</span></section></div>'}
  </main>${video?`<script>
  play.onclick=async()=>{video.src='https://video.example.test/demo.webm';await video.play();play.hidden=true;navigator.mediaSession.metadata=new MediaMetadata({title:'A little more focus',artist:'Northstar · demo video'});};
  </script>`:''}</body></html>`;
}

const profile=join(temporary,'profile');await mkdir(join(profile,'Default'),{recursive:true});
await writeFile(join(profile,'Default','Preferences'),JSON.stringify({profile:{default_content_setting_values:{auto_picture_in_picture:1}}}));
const videoFile=join(temporary,'demo.webm');
execFileSync('ffmpeg',['-hide_banner','-loglevel','error','-f','lavfi','-i','color=c=0x163b56:s=960x540:r=20','-f','lavfi','-i','sine=frequency=220:sample_rate=48000','-vf',"drawbox=x=700:y=80:w=200:h=380:color=0x3c8297:t=fill,drawtext=fontfile=/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf:text='NORTHSTAR - DEMO VIDEO':fontcolor=0xb9dce9:fontsize=19:x=64:y=82,drawtext=fontfile=/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf:text='A little more focus.':fontcolor=white:fontsize=60:x=64:y=215,drawtext=fontfile=/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf:text='Keep watching. Keep your flow.':fontcolor=0xd0e1ed:fontsize=24:x=66:y=302",'-t','20','-c:v','libvpx-vp9','-cpu-used','8','-b:v','250k','-c:a','libopus','-af','volume=0.02',videoFile]);
const videoBytes=await readFile(videoFile);
let context;
try {
  await mkdir(output,{recursive:true});
  context=await chromium.launchPersistentContext(profile,{channel:'chromium',headless:false,viewport:null,colorScheme:'dark',ignoreDefaultArgs:['--disable-extensions','--mute-audio','--enable-automation'],args:['--no-sandbox','--force-dark-mode','--force-device-scale-factor=1','--window-position=0,0','--window-size=1280,900','--enable-features=AutoPictureInPictureForVideoPlayback,MediaSessionEnterPictureInPicture',`--disable-extensions-except=${process.cwd()}`,`--load-extension=${process.cwd()}`]});
  await context.route('https://**/*',route=>route.request().url()==='https://video.example.test/demo.webm'?route.fulfill({status:200,contentType:'video/webm',body:videoBytes}):route.fulfill({status:200,contentType:'text/html',body:website(route.request().url())}));
  let [worker]=context.serviceWorkers();if(!worker)worker=await context.waitForEvent('serviceworker');
  const extension=`chrome-extension://${worker.url().split('/')[2]}`;
  const controls=await context.newPage();await controls.goto(extension+'/src/options/index.html');for(const page of context.pages())if(page!==controls&&page.url()==='about:blank')await page.close();
  await controls.evaluate(async model=>{await chrome.storage.local.set({arcSidebarModel:model,arcSidebarState:{currentSpaceId:'work',collapsedFolders:{resources:true}},arcSidebarMode:'native',arcSidebarAutohideTimeout:800,arcSidebarOverlayWidth:390,arcSidebarAutoPipEnabled:true});},model);
  const live=await controls.evaluate(async()=>{
    const windowId=(await chrome.windows.getCurrent()).id,ids={};
    for(const itemId of ['mail','calendar','weekend','article','dashboard','brief']){const result=await chrome.runtime.sendMessage({type:'arc-sidebar-tab-action',action:'open',itemId,windowId});if(!result.ok)throw Error(result.error);ids[itemId]=result.values;}
    let groupId=-1;for(let i=0;i<100;i++){groupId=(await chrome.tabs.get(ids.brief)).groupId;if(groupId>=0)break;await new Promise(done=>setTimeout(done,50));}if(groupId<0)throw Error('Space group did not initialize');
    ids.review=(await chrome.tabs.create({url:'https://github.com/lophas/arc-sidebar-chrome/pull/42',active:false})).id;await chrome.tabs.group({tabIds:[ids.review],groupId});
    ids.notes=(await chrome.tabs.create({url:'https://notes.example.test/tomorrow',active:false})).id;
    ids.nativePin=(await chrome.tabs.create({url:'https://calendar.google.com/pinned',pinned:true,active:false})).id;
    await chrome.storage.local.set({arcSidebarState:{currentSpaceId:'work',collapsedFolders:{resources:true}}});return {...ids,windowId};
  });
  // Extension-created tabs can start navigating before Playwright attaches.
  // Populate the website fixtures after targets exist; the sidebar stays real.
  for(const page of context.pages())if(page.url().startsWith('https://'))await page.setContent(website(page.url()),{waitUntil:'domcontentloaded'});
  const briefUrl=await controls.evaluate(async id=>(await chrome.tabs.get(id)).url,live.brief);
  let brief;for(let i=0;i<100;i++){brief=context.pages().find(page=>page.url()===briefUrl);if(brief)break;await new Promise(done=>setTimeout(done,50));}assert.ok(brief,'Project brief tab must load');
  await controls.evaluate(windowId=>{const button=document.createElement('button');button.id='captureOpenSidebar';button.textContent='Open sidebar';button.onclick=()=>chrome.sidePanel.open({windowId});document.body.prepend(button);},live.windowId);
  await controls.locator('#captureOpenSidebar').click();await brief.bringToFront();await brief.waitForTimeout(1200);
  const desktop=name=>execFileSync('import',['-window','root',join(output,name)]);
  desktop('workspace.png');console.log('Captured native Chrome groups and sidebar');

  const video=await context.newPage();await video.goto('https://video.example.test/focus');await controls.evaluate(async windowId=>{const tab=(await chrome.tabs.query({url:'https://video.example.test/focus'}))[0];if(tab.windowId!==windowId)await chrome.tabs.move(tab.id,{windowId,index:-1});await chrome.windows.update(windowId,{focused:true});await chrome.tabs.update(tab.id,{active:true});},live.windowId);await video.bringToFront();await video.locator('#play').click();
  await video.waitForFunction(()=>!document.querySelector('video').paused&&document.querySelector('video').videoWidth>0);await video.waitForTimeout(6500);await controls.evaluate(async id=>{await chrome.tabs.update(id,{active:true});},live.brief);await brief.bringToFront();
  try{await video.waitForFunction(()=>globalThis.__arcSidebarAutoPip?.getState().player==='video',{},{timeout:12000});}catch{console.log('Preparing the same native PiP surface explicitly for the screenshot');await video.bringToFront();await video.evaluate(()=>{const button=document.createElement('button');button.id='capturePip';button.textContent='Open mini player';button.onclick=()=>document.querySelector('video').requestPictureInPicture();document.body.append(button);});await video.locator('#capturePip').click();await brief.bringToFront();}await brief.waitForTimeout(1000);desktop('mini-player.png');
  await video.bringToFront();await video.evaluate(async()=>{if(document.pictureInPictureElement)await document.exitPictureInPicture();document.querySelector('video').pause();});await video.close();console.log('Captured native video PiP over another working tab');

  await controls.evaluate(async windowId=>{if(chrome.sidePanel.close)await chrome.sidePanel.close({windowId});else{await chrome.sidePanel.setOptions({enabled:false});await chrome.sidePanel.setOptions({enabled:true});}await chrome.storage.local.set({arcSidebarMode:'overlay'});},live.windowId);
  const sidebar=await context.newPage();await sidebar.setViewportSize({width:390,height:760});await sidebar.goto(extension+'/src/sidepanel/index.html');
  await sidebar.locator('.space-button[data-space-id="work"]').click();await sidebar.locator('#pinned .row').first().waitFor();
  const settle=async page=>{await page.mouse.move(1,1);await page.waitForTimeout(450);await page.evaluate(()=>Promise.all([...document.images].map(image=>image.decode().catch(()=>{}))));};
  await settle(sidebar);await sidebar.screenshot({path:join(output,'sidebar.png')});
  await sidebar.locator('#openCommandBar').click();await sidebar.locator('.command-input').fill('project');await settle(sidebar);await sidebar.screenshot({path:join(output,'sidebar-search.png')});await sidebar.keyboard.press('Escape');
  const panels=[];for(const [spaceId,theme]of[['work','dark'],['personal','light'],['reading','dark']]){await sidebar.emulateMedia({colorScheme:theme});await sidebar.locator(`.space-button[data-space-id="${spaceId}"]`).click();await settle(sidebar);const path=join(temporary,`palette-${spaceId}.png`);await sidebar.screenshot({path});panels.push(path);}
  execFileSync('montage',[...panels,'-tile','3x1','-geometry','+8+0','-background','#10141c',join(output,'space-palettes.png')]);
  await sidebar.locator('.space-button[data-space-id="__open_tabs__"]').click();await settle(sidebar);await sidebar.locator('#openTabs .row').first().waitFor();await sidebar.screenshot({path:join(output,'open-tabs.png')});

  const command=await context.newPage();await command.setViewportSize({width:760,height:520});await command.goto(extension+`/src/sidepanel/command.html?windowId=${live.windowId}&sourceTabId=${live.brief}`);
  await command.locator('.command-result').first().waitFor();await settle(command);await command.screenshot({path:join(output,'search-popup.png')});await command.close();
  await controls.setViewportSize({width:980,height:900});await controls.bringToFront();await controls.locator('#captureOpenSidebar').evaluate(element=>element.remove());
  const card=title=>controls.locator('section.card').filter({has:controls.getByRole('heading',{name:title,exact:true})});
  for(const[id,value]of[['triggerBottom','85'],['triggerTop','25']])await controls.locator('#'+id).evaluate((element,value)=>{element.value=value;element.dispatchEvent(new Event('input',{bubbles:true}));element.dispatchEvent(new Event('change',{bubbles:true}));},value);
  await settle(controls);await controls.screenshot({path:join(output,'options.png'),fullPage:true});await card('Autohide & edge trigger').screenshot({path:join(output,'appearance.png')});await card('Arc import').screenshot({path:join(output,'arc-import.png')});
  const backup=join(temporary,'backup.png'),sync=join(temporary,'sync.png');await card('Backup & restore').screenshot({path:backup});await card('Chrome Sync').screenshot({path:sync});
  execFileSync('montage',[backup,sync,'-tile','1x2','-geometry','+0+12','-background','#10141c',join(output,'backup-sync.png')]);
  await writeFile(join(output,'capture-info.json'),JSON.stringify({extensionVersion:version,browser:context.browser().version(),data:'Fictional example workspaces; real extension, Chrome groups and native video PiP',files:['workspace.png','sidebar.png','sidebar-search.png','space-palettes.png','open-tabs.png','search-popup.png','mini-player.png','appearance.png','arc-import.png','backup-sync.png','options.png']},null,2)+'\n');
  console.log(`Captured 11 current screenshots for extension ${version}`);
}finally{await context?.close();await rm(temporary,{recursive:true,force:true});}
