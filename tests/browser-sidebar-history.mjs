import assert from 'node:assert/strict';
import {cp,mkdtemp,rm} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {createServer} from 'node:http';
import {chromium} from 'playwright-core';

const server=createServer((req,res)=>{res.setHeader('Content-Type','text/html');res.end('<!doctype html><title>'+req.url+'</title><body style="height:1800px">'+req.url);});
await new Promise(done=>server.listen(0,'127.0.0.1',done));
const origin=`http://127.0.0.1:${server.address().port}`;
const directory=await mkdtemp(join(tmpdir(),'arc-history-extension-'));
let context;
try{
 await cp('src',join(directory,'src'),{recursive:true});await cp('manifest.json',join(directory,'manifest.json'));
 context=await chromium.launchPersistentContext('',{channel:'chromium',headless:false,ignoreDefaultArgs:['--disable-extensions'],args:['--no-sandbox',`--disable-extensions-except=${directory}`,`--load-extension=${directory}`]});
 let[worker]=context.serviceWorkers();if(!worker)worker=await context.waitForEvent('serviceworker');
 const controls=await context.newPage();await controls.goto(`chrome-extension://${worker.url().split('/')[2]}/src/sidepanel/index.html`);
 await controls.locator('.space-button[data-space-id="__my_space__"]').waitFor();
 await controls.evaluate(async origin=>{
  await chrome.storage.local.set({arcSidebarMode:'overlay',arcSidebarAutohideTimeout:500,arcSidebarModel:{version:2,favorites:[],spaces:[{id:'test',title:'Test',children:Array.from({length:70},(_,i)=>({id:'link'+i,type:'tab',title:'Link '+i,url:origin+'/link'+i}))}]},arcSidebarState:{currentSpaceId:'test',collapsedFolders:{}}});
 },origin);
 const page=await context.newPage();await page.goto(origin+'/previous');await page.goto(origin+'/current');
 await page.locator('#arc-sidebar-overlay-host').waitFor({state:'attached'});await page.waitForTimeout(300);
 const session=await context.newCDPSession(page);
 const initial=await session.send('Page.getNavigationHistory');
 for(let i=0;i<3;i++){
  await page.mouse.move(640,300);const width=await page.evaluate(()=>document.documentElement.clientWidth);await page.mouse.move(width-1,300);
  let frame;
  for(let j=0;j<60;j++){frame=page.frames().find(f=>f.url().includes('/src/sidepanel/index.html'));if(frame)break;await page.waitForTimeout(50);}
  assert.ok(frame,'Sidebar must load');await frame.locator('#pinned .row').first().waitFor();
  const behavior=await frame.evaluate(()=>[document.documentElement,document.body].map(el=>getComputedStyle(el).overscrollBehaviorX));
  assert.deepEqual(behavior,['none','none'],'both iframe roots must suppress horizontal navigation gestures');
  assert.equal(await page.evaluate(()=>getComputedStyle(document.documentElement).overscrollBehaviorX),'auto','host page keeps its navigation gestures');
  await page.mouse.move(width-140,350);await page.mouse.wheel(450,0);await page.mouse.wheel(-450,0);await page.waitForTimeout(150);
  assert.equal(page.url(),origin+'/current');assert.ok(frame.url().includes('/src/sidepanel/index.html'),'horizontal scrolling leaves the sidebar document in place');
  await page.mouse.wheel(0,450);await frame.waitForFunction(()=>document.querySelector('main').scrollTop>0);
  if(i<2){const other=await context.newPage();await other.goto('about:blank');await page.waitForTimeout(150);await page.bringToFront();await other.close();await page.waitForTimeout(150);}
 }
 const history=await session.send('Page.getNavigationHistory');
 assert.equal(history.currentIndex,initial.currentIndex,'sidebar load/release must not add browser-history entries');
 await session.send('Page.navigateToHistoryEntry',{entryId:history.entries[history.currentIndex-1].id});await page.waitForURL(origin+'/previous');
 await page.goForward();await page.waitForURL(origin+'/current');
 console.log('PASS real extension: iframe roots block horizontal overscroll, vertical sidebar scrolling works, host gestures stay untouched and browser Back/Forward navigate webpages');
}finally{await context?.close();await new Promise(done=>server.close(done));await rm(directory,{recursive:true,force:true});}
