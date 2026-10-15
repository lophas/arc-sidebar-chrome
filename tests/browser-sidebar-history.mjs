import assert from 'node:assert/strict';
import {cp,mkdtemp,rm,writeFile,readFile} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {createServer} from 'node:http';
import {chromium} from 'playwright-core';

const reference=process.argv.find(arg=>arg.startsWith('--regression-ref='))?.split('=')[1];
const server=createServer((req,res)=>{res.setHeader('Content-Type','text/html');res.end('<!doctype html><title>'+req.url+'</title><body style="height:1800px">'+req.url);});
await new Promise(done=>server.listen(0,'127.0.0.1',done));
const origin=`http://127.0.0.1:${server.address().port}`;
async function verify(ref){
 const directory=await mkdtemp(join(tmpdir(),'arc-history-extension-'));
 let context;
 try{
  await cp('src',join(directory,'src'),{recursive:true});await cp('manifest.json',join(directory,'manifest.json'));
  if(ref){
   await writeFile(join(directory,'src/overlay/overlay.js'),execFileSync('git',['show',ref+':src/overlay/overlay.js']));
   const path=join(directory,'src/background/overlay-delivery.js');await writeFile(path,(await readFile(path,'utf8')).replaceAll('edge-intent-v4','edge-intent-v3'));
  }
  context=await chromium.launchPersistentContext('',{channel:'chromium',headless:false,ignoreDefaultArgs:['--disable-extensions'],args:['--no-sandbox',`--disable-extensions-except=${directory}`,`--load-extension=${directory}`]});
  let[worker]=context.serviceWorkers();if(!worker)worker=await context.waitForEvent('serviceworker');
  await worker.evaluate(()=>chrome.storage.local.set({arcSidebarMode:'overlay',arcSidebarAutohideTimeout:500}));
  const page=await context.newPage();await page.goto(origin+'/previous');await page.goto(origin+'/current');
  await page.locator('#arc-sidebar-overlay-host').waitFor({state:'attached'});await page.waitForTimeout(300);
  const session=await context.newCDPSession(page);
  const initial=await session.send('Page.getNavigationHistory');
  for(let i=0;i<3;i++){
   await page.mouse.move(640,300);const width=await page.evaluate(()=>document.documentElement.clientWidth);await page.mouse.move(width-1,300);
   const waitFrame=async()=>{for(let j=0;j<60;j++){const frame=page.frames().find(f=>f.url().includes('/src/sidepanel/index.html'));if(frame)return frame;await page.waitForTimeout(50);}throw Error('Sidebar did not load');};
   const frame=await waitFrame();await frame.locator('.search-wrap').waitFor({state:'attached'});
   await page.mouse.move(width-140,300);
   if(i<2){const other=await context.newPage();await other.goto('about:blank');await page.waitForTimeout(150);await page.bringToFront();await other.close();await page.waitForTimeout(150);}
  }
  const history=await session.send('Page.getNavigationHistory');
  console.log('Real extension history',JSON.stringify({baseline:!!ref,initial:initial.entries.map(e=>e.url),after:history.entries.map(e=>e.url),index:history.currentIndex}));
  await session.send('Page.navigateToHistoryEntry',{entryId:history.entries[history.currentIndex-1].id});await page.waitForTimeout(400);
  if(ref){console.log('Baseline Back result',JSON.stringify({url:page.url(),frames:page.frames().map(f=>f.url())}));}
  else{assert.equal(history.currentIndex,initial.currentIndex,'lazy sidebar navigation must not add browser-history entries');await page.waitForURL(origin+'/previous');await page.goForward();await page.waitForURL(origin+'/current');console.log('PASS real extension: repeated sidebar load/release keeps browser Back/Forward on webpages');}
 }finally{await context?.close();await rm(directory,{recursive:true,force:true});}
}
try{if(reference)await verify(reference);await verify();}finally{await new Promise(done=>server.close(done));}
