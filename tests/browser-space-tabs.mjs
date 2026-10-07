import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { resolve, extname } from 'node:path';
import { chromium } from 'playwright-core';
const root=process.cwd();
let html=await readFile('src/sidepanel/index.html','utf8');
html=html.replace(/<script[^>]*>[\s\S]*?<\/script>/g,'').replace('</body>',`<script src="/tests/fixtures/space-tabs-chrome.js"></script><script type="module" src="index.js"></script><script type="module" src="manage.js"></script><script type="module" src="folder-manage.js"></script><script type="module" src="space-dnd.js"></script><script type="module" src="hierarchy-dnd.js"></script><script type="module" src="root-drop.js"></script><script type="module" src="open-pin.js"></script><script type="module" src="workflow-pin-dnd.js"></script></body>`);
const server=createServer(async(req,res)=>{
 const pathname=new URL(req.url,'http://localhost').pathname;
 if(pathname==='/src/sidepanel/index.html'){res.setHeader('Content-Type','text/html');res.end(html);return;}
 const file=resolve(root,'.'+pathname);
 if(!file.startsWith(root+'/')){res.writeHead(403);res.end();return;}
 try{res.setHeader('Content-Type',extname(file)==='.js'?'text/javascript':extname(file)==='.css'?'text/css':'application/octet-stream');res.end(await readFile(file));}catch{res.writeHead(404);res.end();}
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const browser=await chromium.launch({executablePath:process.argv[2]||'/usr/bin/google-chrome',headless:true,args:['--no-sandbox']});
try{
 const page=await browser.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto(`http://127.0.0.1:${server.address().port}/src/sidepanel/index.html`);
 const ids=()=>page.locator('#openTabs .row').evaluateAll(rows=>rows.map(row=>Number(row.dataset.liveTabId)));
 await page.waitForFunction(()=>document.querySelectorAll('#openTabs .row').length===3);
 assert.deepEqual(await ids(),[11,12,21]);assert.equal(await page.locator('.other-window-label').textContent(),'Other window');
 await page.locator('[data-live-tab-id="12"]').click();
 assert.equal(await page.evaluate(()=>fixture.calls.findLast(c=>c.type==='arc-sidebar-tab-action')?.tabId),12);
 await page.waitForFunction(()=>document.querySelector('[data-live-tab-id="12"]')?.dataset.openPinManaged==='1');
 await page.locator('[data-live-tab-id="12"]').click({button:'right'});
 assert.equal(await page.locator('#openPinUrl').inputValue(),'https://12.test');
 await page.locator('#openPinSave').click();
 await page.waitForFunction(()=>!document.querySelector('[data-live-tab-id="12"]'));
 assert.deepEqual(await ids(),[11,21]);
 await page.evaluate(()=>{
  const source=document.querySelector('[data-live-tab-id="11"]'), target=document.querySelector('[data-saved-node-id="a"]');
  const transfer=new DataTransfer();source.dispatchEvent(new DragEvent('dragstart',{bubbles:true,dataTransfer:transfer}));
  const rect=target.getBoundingClientRect();
  target.dispatchEvent(new DragEvent('dragover',{bubbles:true,cancelable:true,dataTransfer:transfer,clientY:rect.top+1}));
  if(!target.classList.contains('workflow-drop-before'))throw Error('No drag insertion indicator');
  target.dispatchEvent(new DragEvent('drop',{bubbles:true,cancelable:true,dataTransfer:transfer,clientY:rect.top+1}));
  source.dispatchEvent(new DragEvent('dragend',{bubbles:true,dataTransfer:transfer}));
 });
 await page.waitForFunction(()=>!document.querySelector('[data-live-tab-id="11"]'));
 assert.equal(await page.evaluate(()=>fixture.data.local.arcSidebarModel.spaces[0].children[0].title),'Workflow 11');
 assert.equal(await page.evaluate(()=>fixture.data.session.arcSidebarBindings[fixture.data.local.arcSidebarModel.spaces[0].children[0].id]),11);
 assert.equal(await page.evaluate(()=>fixture.tabs.some(tab=>tab.id===11)),true);
 await page.evaluate(()=>{fixture.tabs.find(t=>t.id===21).groupId=5;chrome.tabs.onUpdated.emit(21,{groupId:5});});
 await page.waitForFunction(()=>document.querySelector('#openSection').classList.contains('hidden'));
 await page.locator('[data-space-id="other"]').click();
 await page.waitForFunction(()=>document.querySelectorAll('#openTabs .row').length===2);
 assert.deepEqual(await ids(),[30,21]);
 await page.locator('[data-live-tab-id="30"] .close-tab').click();
 await page.waitForFunction(()=>!document.querySelector('[data-live-tab-id="30"]'));
 await page.locator('[data-space-id="__open_tabs__"]').click();
 await page.waitForFunction(()=>document.querySelectorAll('#openTabs .row').length===4);
 // Regression: a root folder must be movable between pinned link rows,
 // including with the other drag handlers installed in their production order.
 await page.evaluate(async()=>{
  const model=fixture.data.local.arcSidebarModel;
  model.spaces[0].children=[{id:'one',type:'tab',title:'One',url:'https://one.test'},{id:'two',type:'tab',title:'Two',url:'https://two.test'},{id:'folder-a',type:'folder',title:'Folder A',children:[{id:'inside',type:'tab',title:'Inside',url:'https://inside.test'}]},{id:'folder-b',type:'folder',title:'Folder B',children:[]}];
  await fixture.write('local',{arcSidebarModel:model,arcSidebarState:{currentSpaceId:'work',collapsedFolders:{}}});
 });
 await page.waitForFunction(()=>document.querySelector('[data-folder-reorder-id="folder-a"]')?.draggable && document.querySelector('[data-saved-node-id="one"]')?.dataset.folderDropManaged==='1');
 async function dragFolder(sourceId,targetSelector,after) {
  await page.evaluate(({sourceId,targetSelector,after})=>{
   const source=document.querySelector(`[data-folder-reorder-id="${sourceId}"]`),target=document.querySelector(targetSelector),transfer=new DataTransfer();
   source.dispatchEvent(new DragEvent('dragstart',{bubbles:true,dataTransfer:transfer}));
   const rect=target.getBoundingClientRect(),clientY=after?rect.bottom-1:rect.top+1;
   target.dispatchEvent(new DragEvent('dragover',{bubbles:true,cancelable:true,dataTransfer:transfer,clientY}));
   const indicator=target.classList.contains('folder-header')?target.parentElement:target;
   if(!indicator.classList.contains(after?'folder-reorder-after':'folder-reorder-before'))throw Error('Missing folder insertion indicator');
   target.dispatchEvent(new DragEvent('drop',{bubbles:true,cancelable:true,dataTransfer:transfer,clientY}));
   source.dispatchEvent(new DragEvent('dragend',{bubbles:true,dataTransfer:transfer}));
  },{sourceId,targetSelector,after});
 }
 await dragFolder('folder-a','[data-saved-node-id="two"]',false);
 await page.waitForFunction(()=>fixture.data.local.arcSidebarModel.spaces[0].children[1]?.id==='folder-a');
 assert.deepEqual(await page.evaluate(()=>fixture.data.local.arcSidebarModel.spaces[0].children.map(n=>n.id)),['one','folder-a','two','folder-b']);
 assert.equal(await page.evaluate(()=>fixture.data.local.arcSidebarModel.spaces[0].children[1].children[0].id),'inside');
 await page.waitForFunction(()=>document.querySelector('[data-folder-reorder-id="folder-a"]')?.draggable);
 await dragFolder('folder-a','[data-saved-node-id="two"]',true);
 await page.waitForFunction(()=>fixture.data.local.arcSidebarModel.spaces[0].children[2]?.id==='folder-a');
 await page.waitForFunction(()=>document.querySelector('[data-folder-reorder-id="folder-a"]')?.draggable);
 await dragFolder('folder-a','[data-folder-reorder-id="folder-b"]',true);
 await page.waitForFunction(()=>fixture.data.local.arcSidebarModel.spaces[0].children[3]?.id==='folder-a');
 console.log('PASS real Chrome: folder insertion before/after pinned links and other folders, preserving children');
 await page.setViewportSize({width:360,height:900});
 // Favorites: native mouse dragging, pinned folder promotion, and an empty-list target.
 await page.evaluate(async()=>{
  const model=fixture.data.local.arcSidebarModel;
  model.favorites=[{id:'f1',type:'tab',title:'First',url:'https://first.test'},{id:'f2',type:'tab',title:'Second',url:'https://second.test'}];
  model.spaces[0].children=[{id:'folder',type:'folder',title:'Folder',children:[{id:'a',type:'tab',title:'Saved A',url:'https://a.test',icon:'data:image/png;base64,AA=='}]}];
  await fixture.write('local',{arcSidebarModel:model});
 });
 await page.waitForFunction(()=>document.querySelector('[data-favorite-id="f1"]')?.draggable);
 const favoriteTarget = await page.locator('[data-favorite-id="f2"]').boundingBox();
 await page.locator('[data-favorite-id="f1"]').dragTo(page.locator('[data-favorite-id="f2"]'),{targetPosition:{x:favoriteTarget.width-5,y:20}});
 await page.waitForFunction(()=>fixture.data.local.arcSidebarModel.favorites[1]?.id==='f1');
 await page.waitForFunction(()=>document.querySelector('[data-saved-node-id="a"]')?.draggable);
 await page.evaluate(()=>{
  const source=document.querySelector('[data-saved-node-id="a"]'),target=document.querySelector('[data-favorite-id="f2"]'),transfer=new DataTransfer(),rect=target.getBoundingClientRect();
  source.dispatchEvent(new DragEvent('dragstart',{bubbles:true,dataTransfer:transfer}));
  target.dispatchEvent(new DragEvent('dragover',{bubbles:true,cancelable:true,dataTransfer:transfer,clientX:rect.left+1}));
  if(!target.classList.contains('favorite-drop-before'))throw Error('Missing Favorites insertion indicator');
  target.dispatchEvent(new DragEvent('drop',{bubbles:true,cancelable:true,dataTransfer:transfer,clientX:rect.left+1}));
  source.dispatchEvent(new DragEvent('dragend',{bubbles:true,dataTransfer:transfer}));
 });
 await page.waitForFunction(()=>fixture.data.local.arcSidebarModel.favorites[0]?.id==='a');
 assert.deepEqual(await page.evaluate(()=>fixture.data.local.arcSidebarModel.favorites.map(n=>n.id)),['a','f2','f1']);
 assert.equal(await page.evaluate(()=>fixture.data.local.arcSidebarModel.spaces[0].children[0].children.length),0);
 assert.equal(await page.evaluate(()=>fixture.data.session.arcSidebarBindings.a),10);
 assert.equal(await page.evaluate(()=>fixture.data.local.arcSidebarModel.favorites[0].icon),'data:image/png;base64,AA==');
 assert.equal(await page.evaluate(()=>fixture.tabs.filter(t=>t.id===10).length),1);
 await page.evaluate(async()=>{
  const model=fixture.data.local.arcSidebarModel;model.favorites=[];
  model.spaces[0].children=[{id:'empty-target',type:'tab',title:'Empty target',url:'https://empty.test'}];
  await fixture.write('local',{arcSidebarModel:model});
 });
 await page.waitForFunction(()=>document.querySelector('[data-saved-node-id="empty-target"]')?.draggable);
 await page.locator('[data-saved-node-id="empty-target"]').dragTo(page.locator('#addFavorite'));
 await page.waitForFunction(()=>fixture.data.local.arcSidebarModel.favorites[0]?.id==='empty-target');
 console.log('PASS real Chrome: native Favorites reorder, nested pinned-to-Favorites preserving tab/icon, empty Favorites drop');
 assert.deepEqual(errors,[]);console.log('PASS real Chrome: Space workflow rendering, drag-to-pin/pin/activate/close, group changes and Open-tabs view');
}finally{await browser.close();await new Promise(resolve=>server.close(resolve));}
