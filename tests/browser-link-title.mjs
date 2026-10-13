import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { cp, mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { chromium } from 'playwright-core';
const directory=await mkdtemp(join(tmpdir(),'arc-title-extension-'));
await cp('src',join(directory,'src'),{recursive:true});
await cp('manifest.json',join(directory,'manifest.json'));
let extensionId,titleRequests=0;
const server=createServer((req,res)=>{
 const pathname=new URL(req.url,'http://localhost').pathname;
 res.setHeader('Content-Type','text/html; charset=utf-8');
 if(pathname==='/host'){res.end(`<!doctype html><title>Host page</title><iframe id="titleSidebar" style="width:420px;height:850px" src="chrome-extension://${extensionId}/src/sidepanel/index.html"></iframe>`);return;}
 if(pathname==='/fail'){res.writeHead(503);res.end('Temporary failure');return;}
 if(pathname==='/page')titleRequests++;
 res.end(`<!doctype html><title>${pathname==='/live'?'ChatGPT':'Index – hírek &amp; események'}</title><h1>A heading that must not replace the tab title</h1>`);
});
await new Promise(done=>server.listen(0,'127.0.0.1',done));
let context;
try{
 context=await chromium.launchPersistentContext('',{channel:'chromium',headless:false,args:['--no-sandbox',`--disable-extensions-except=${directory}`,`--load-extension=${directory}`]});
 let [worker]=context.serviceWorkers();if(!worker)worker=await context.waitForEvent('serviceworker');
 extensionId=worker.url().split('/')[2];
 console.log('Loaded extension worker:',worker.url());
 let frame;
 const waitForTitle=async title=>{
  for(let i=0;i<100;i++){
   const current=await frame.evaluate(async()=> (await chrome.storage.local.get('arcSidebarModel')).arcSidebarModel?.favorites?.[0]?.title);
   if(current===title)return;
   await new Promise(done=>setTimeout(done,100));
  }
  assert.fail('Saved Favorite title did not become '+title);
 };

 const page=await context.newPage();const errors=[];page.on('pageerror',error=>{errors.push(error.message);console.error('Sidebar page error:',error.message);});
 page.on('console',message=>{if(message.type()==='error')console.error('Sidebar console:',message.text());});
 const port=server.address().port,host=`http://localhost:${port}/host`,target=`http://127.0.0.1:${port}/page`;
 await page.goto(host);
 const sidebar=page.frameLocator('#titleSidebar');
 try {await sidebar.locator('[data-space-id="__my_space__"]').waitFor({timeout:15000});}
 catch(error){console.error('Sidebar initialization:',await Promise.all(page.frames().map(frame=>frame.evaluate(()=>({url:location.href,runtime:!!globalThis.chrome?.runtime,storage:!!globalThis.chrome?.storage,text:document.body?.innerText?.slice(0,1000)})).catch(error=>({error:error.message})))));throw error;}
 frame=page.frames().find(frame=>frame.url().startsWith(`chrome-extension://${extensionId}/src/sidepanel/index.html`));assert.ok(frame);
 const legacy=await frame.evaluate(async url=>{try{const response=await fetch(url,{credentials:'omit'});return {status:response.status};}catch(error){return {error:error.message};}},target);
 console.log('Embedded foreground fetch diagnostic:',JSON.stringify(legacy));
 titleRequests=0;
 await sidebar.locator('#addFavorite').click();
 const editor=sidebar.locator('dialog[open]');
 await editor.locator('#itemUrl').fill(target);
 await editor.locator('#itemSave').click();
 await waitForTitle('Index – hírek & események');
 assert.equal(titleRequests,1);
 console.log('PASS real Chromium extension: embedded sidebar saves a closed cross-origin page title via its real worker, with HTML entities decoded');
 const storedId=await frame.evaluate(async()=> (await chrome.storage.local.get('arcSidebarModel')).arcSidebarModel.favorites[0].id);
 await sidebar.locator(`[data-favorite-id="${storedId}"]`).click({button:'right'});
 await editor.locator('#itemTitle').fill('My manual title');await editor.locator('#itemSave').click();
 await waitForTitle('My manual title');
 assert.equal(titleRequests,1,'manual titles never trigger a network title request');
 await sidebar.locator(`[data-favorite-id="${storedId}"]`).click({button:'right'});
 await editor.locator('#itemTitle').fill('');await editor.locator('#itemSave').click();
 await waitForTitle('Index – hírek & események');
 assert.equal(titleRequests,2,'clearing a saved title performs a fresh lookup');
 const live=await context.newPage();const liveUrl=`http://127.0.0.1:${port}/live`;
 await live.goto(liveUrl);await page.bringToFront();
 const liveTitle=await frame.evaluate(async url=>(await import('./link-title.js')).resolvePageTitle(url),liveUrl);
 assert.equal(liveTitle,'ChatGPT','use the Chrome tab title, not an application heading');
 assert.equal(titleRequests,2,'open tab title lookup does not fetch the website');
 const failed=await frame.evaluate(async url=>(await import('./link-title.js')).resolvePageTitle(url),`http://127.0.0.1:${port}/fail`);
 assert.equal(failed,'');
 assert.deepEqual(errors,[]);
 console.log('PASS real Chromium extension: manual titles preserved, repeated blank-title refresh, live Chrome tab title priority and HTTP failure fallback');
}finally{await context?.close();await new Promise(done=>server.close(done));await rm(directory,{recursive:true,force:true});}
