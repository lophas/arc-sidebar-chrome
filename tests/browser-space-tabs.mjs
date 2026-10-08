import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { resolve, extname } from 'node:path';
import { chromium } from 'playwright-core';
const root=process.cwd();
let html=await readFile('src/sidepanel/index.html','utf8');
html=html.replace(/<script[^>]*>[\s\S]*?<\/script>/g,'').replace('</body>',`<script src="/tests/fixtures/space-tabs-chrome.js"></script><script type="module" src="index.js"></script><script type="module" src="drag-scroll.js"></script><script type="module" src="manage.js"></script><script type="module" src="folder-manage.js"></script><script type="module" src="space-dnd.js"></script><script type="module" src="hierarchy-dnd.js"></script><script type="module" src="root-drop.js"></script><script type="module" src="open-pin.js"></script><script type="module" src="workflow-pin-dnd.js"></script><script type="module" src="memory-controls.js"></script></body>`);
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
 // Reverse move: all existing drag handlers remain installed.
 await page.evaluate(async()=>{
  const model=fixture.data.local.arcSidebarModel;
  model.favorites=[{id:'a',type:'tab',title:'Saved A',url:'https://a.test',icon:'custom'},...['edge','into','nested','empty'].map(id=>({id,type:'tab',title:id,url:`https://${id}.test`}))];
  model.spaces[0].children=[{id:'root',type:'tab',title:'Root',url:'https://root.test'},{id:'destination',type:'folder',title:'Destination',children:[{id:'child',type:'tab',title:'Child',url:'https://child.test'}]},{id:'blank',type:'folder',title:'Blank',children:[]}];
  await fixture.write('local',{arcSidebarModel:model});
 });
 await page.waitForFunction(()=>document.querySelector('[data-favorite-id="a"]')?.draggable);
 await page.locator('[data-favorite-id="a"]').dragTo(page.locator('[data-saved-node-id="root"]'),{targetPosition:{x:35,y:2}});
 await page.waitForFunction(()=>fixture.data.local.arcSidebarModel.spaces[0].children[0]?.id==='a');
 assert.equal(await page.evaluate(()=>fixture.data.session.arcSidebarBindings.a),10);
 assert.equal(await page.evaluate(()=>fixture.data.local.arcSidebarModel.spaces[0].children[0].icon),'custom');
 async function dragFavorite(id,selector,fraction,indicator) {
  await page.waitForFunction(id=>document.querySelector(`[data-favorite-id="${id}"]`)?.draggable,id);
  await page.evaluate(({id,selector,fraction,indicator})=>{
   const source=document.querySelector(`[data-favorite-id="${id}"]`),target=document.querySelector(selector),transfer=new DataTransfer(),rect=target.getBoundingClientRect();
   const clientY=rect.top+rect.height*fraction;
   source.dispatchEvent(new DragEvent('dragstart',{bubbles:true,dataTransfer:transfer}));
   target.dispatchEvent(new DragEvent('dragover',{bubbles:true,cancelable:true,dataTransfer:transfer,clientY}));
   if(!document.querySelector(`.${indicator}`))throw Error('Missing Favorite-to-pinned indicator');
   target.dispatchEvent(new DragEvent('drop',{bubbles:true,cancelable:true,dataTransfer:transfer,clientY}));
   source.dispatchEvent(new DragEvent('dragend',{bubbles:true,dataTransfer:transfer}));
  },{id,selector,fraction,indicator});
  await page.waitForFunction(id=>!fixture.data.local.arcSidebarModel.favorites.some(item=>item.id===id),id);
 }
 await dragFavorite('edge','[data-folder-node-id="destination"] > .folder-header',.95,'favorite-pinned-after');
 assert.deepEqual(await page.evaluate(()=>fixture.data.local.arcSidebarModel.spaces[0].children.map(n=>n.id)),['a','root','destination','edge','blank']);
 await dragFavorite('into','.folder-header[data-folder-node-id="destination"]',.5,'favorite-pinned-into');
 await dragFavorite('nested','[data-saved-node-id="child"]',.05,'favorite-pinned-before');
 assert.deepEqual(await page.evaluate(()=>fixture.data.local.arcSidebarModel.spaces[0].children[2].children.map(n=>n.id)),['nested','child','into']);
 await dragFavorite('empty','.folder-header[data-folder-node-id="blank"]',.5,'favorite-pinned-into');
 assert.equal(await page.evaluate(()=>fixture.data.local.arcSidebarModel.spaces[0].children[4].children[0].id),'empty');
 await page.evaluate(async()=>{
  const model=fixture.data.local.arcSidebarModel;
  model.favorites=[{id:'empty-space',type:'tab',title:'Empty Space',url:'https://empty-space.test'}];model.spaces[0].children=[];
  await fixture.write('local',{arcSidebarModel:model});
 });
 await dragFavorite('empty-space','#pinnedSection .section-title',.5,'favorite-pinned-into');
 assert.equal(await page.evaluate(()=>fixture.data.local.arcSidebarModel.spaces[0].children[0].id),'empty-space');
 assert.equal(await page.locator('.favorite-pinned-before,.favorite-pinned-after,.favorite-pinned-into').count(),0);
 console.log('PASS real Chrome: Favorite-to-Space native dragging, folder edge/inside/nested/empty Space drops preserving tab/icon');
 // Edge scrolling must see drags even when insertion handlers consume events.
 await page.setViewportSize({width:360,height:500});
 await page.evaluate(async()=>{
  const model=fixture.data.local.arcSidebarModel;
  model.favorites=[{id:'scroll-favorite',type:'tab',title:'Scroll Favorite',url:'https://scroll-fav.test'}];
  model.spaces[0].children=[{id:'scroll-folder',type:'folder',title:'Scroll Folder',children:[]},...Array.from({length:45},(_,i)=>({id:`scroll-${i}`,type:'tab',title:`Scroll ${i}`,url:`https://scroll-${i}.test`}))];
  await fixture.write('local',{arcSidebarModel:model});document.querySelector('main').scrollTop=0;
 });
 await page.waitForFunction(()=>document.querySelector('[data-folder-reorder-id="scroll-folder"]')?.draggable && document.querySelector('[data-saved-node-id="scroll-0"]')?.draggable);
 for(const sourceSelector of ['[data-saved-node-id="scroll-0"]','[data-folder-reorder-id="scroll-folder"]','[data-favorite-id="scroll-favorite"]','[data-live-tab-id="11"]']) {
  await page.evaluate(sourceSelector=>{
   const main=document.querySelector('main');main.scrollTop=0;
   const source=document.querySelector(sourceSelector);if(!source?.draggable)throw Error('Missing draggable scroll source '+sourceSelector);
   const transfer=new DataTransfer();window.scrollDrag={source,transfer};
   source.dispatchEvent(new DragEvent('dragstart',{bubbles:true,dataTransfer:transfer}));
   const rect=main.getBoundingClientRect(),clientX=rect.left+40,clientY=rect.bottom-4,target=document.elementFromPoint(clientX,clientY);
   target.dispatchEvent(new DragEvent('dragover',{bubbles:true,cancelable:true,dataTransfer:transfer,clientX,clientY}));
  },sourceSelector);
  await page.waitForFunction(()=>document.querySelector('main').scrollTop>180);
  await page.evaluate(()=>scrollDrag.source.dispatchEvent(new DragEvent('dragend',{bubbles:true,dataTransfer:scrollDrag.transfer})));
  const stopped=await page.locator('main').evaluate(el=>el.scrollTop);
  await page.waitForTimeout(80);
  assert.equal(await page.locator('main').evaluate(el=>el.scrollTop),stopped);
 }
 await page.evaluate(()=>{
  const main=document.querySelector('main');main.scrollTop=700;
  const source=document.querySelector('[data-saved-node-id="scroll-20"]'),transfer=new DataTransfer();window.scrollDrag={source,transfer};
  source.dispatchEvent(new DragEvent('dragstart',{bubbles:true,dataTransfer:transfer}));
  const rect=main.getBoundingClientRect(),clientX=rect.left+40,clientY=rect.top+4;
  document.elementFromPoint(clientX,clientY).dispatchEvent(new DragEvent('dragover',{bubbles:true,cancelable:true,dataTransfer:transfer,clientX,clientY}));
 });
 await page.waitForFunction(()=>document.querySelector('main').scrollTop<500);
 await page.evaluate(()=>scrollDrag.source.dispatchEvent(new DragEvent('dragend',{bubbles:true,dataTransfer:scrollDrag.transfer})));
 console.log('PASS real Chrome: continuous up/down edge drag scrolling for pinned links, folders, Favorites and workflow tabs; drag cancellation stops scrolling');
 // Live controls share centered geometry and reveal Close on pointer/keyboard hover.
 await page.setViewportSize({width:360,height:900});
 await page.evaluate(async()=>{
  fixture.tabs.push({id:999,windowId:1,index:-1,groupId:-1,pinned:true,title:'Native pinned',url:'https://native.test'});
  const model=fixture.data.local.arcSidebarModel;
  model.favorites=[{id:'a',type:'tab',title:'Saved A',url:'https://a.test'},{id:'native-favorite',type:'tab',title:'Native saved',url:'https://native.test'}];
  model.spaces[0].children[0].children=[{id:'b',type:'tab',title:'Saved B',url:'https://b.test'}];
  await fixture.write('session',{arcSidebarBindings:{a:10,b:22,'native-favorite':999}});
  await fixture.write('local',{arcSidebarModel:model});document.querySelector('main').scrollTop=0;
 });
 for(const selector of ['[data-favorite-id="a"] .live-dot-close','.folder-header[data-folder-node-id="scroll-folder"] .live-dot-close','[data-saved-node-id="b"] .live-dot-close']){
  await page.waitForFunction(selector=>!!document.querySelector(selector),selector);
  const centered=await page.locator(selector).evaluate(button=>{
   const rect=button.getBoundingClientRect(),parent=button.parentElement.getBoundingClientRect();
   return Math.abs(rect.top+rect.height/2-parent.top-parent.height/2)<1;
  });
  assert.equal(centered,true,'Live control vertically centered '+selector);
  await page.locator(selector).hover();
  assert.equal(await page.locator(selector).evaluate(el=>getComputedStyle(el,'::before').content),'"×"');
  assert.equal(await page.locator(selector).evaluate(el=>getComputedStyle(el,'::after').content),'"Close"');
 }
 assert.equal(await page.locator('[data-favorite-id="native-favorite"] .live-dot-close').count(),0);
 // Open-tabs group rendering, group-close full membership, cancel and confirm.
 await page.evaluate(()=>{
  fixture.tabs.push({id:40,windowId:1,index:20,groupId:-1,title:'Ungrouped page',url:'https://ungrouped.test'},{id:41,windowId:1,index:21,groupId:4,title:'Other group page',url:'https://other.test'});
  chrome.tabs.onCreated.emit(fixture.tabs.at(-1));
 });
 await page.locator('[data-space-id="__open_tabs__"]').click();
 await page.waitForFunction(()=>document.querySelectorAll('.open-tab-group').length===3);
 assert.deepEqual(await page.locator('.open-tab-group').evaluateAll(groups=>groups.map(g=>g.dataset.chromeGroupId)),['2','-1','4']);
 assert.deepEqual(await page.locator('.open-tab-group-name').allTextContents(),['Work','Ungrouped','Other']);
 assert.equal(await page.locator('#openTabs > :first-child').getAttribute('class'),'native-pinned-tabs');
 const nativeRow=page.locator('[data-native-pinned-tab-id="999"]');
 assert.equal(await nativeRow.getAttribute('title'),'Pinned tab');
 assert.equal(await nativeRow.locator('button,.live-dot-close').count(),0);
 assert.equal(await nativeRow.evaluate(el=>el.draggable),false);
 const beforeReadonly=await page.evaluate(()=>fixture.calls.length);await nativeRow.click();
 assert.equal(await page.evaluate(()=>fixture.calls.length),beforeReadonly);
 for(const selector of ['[data-chrome-group-id="2"] .close-tab-group','[data-live-tab-id="10"] .close-tab']){
  await page.locator(selector).hover();
  assert.equal(await page.locator(selector).evaluate(el=>getComputedStyle(el,'::before').content),'"×"');
  assert.equal(await page.locator(selector).evaluate(el=>getComputedStyle(el,'::after').content),'"Close"');
 }
 console.log('PASS real Chrome: centered live controls on Favorites/links/folders/tabs/groups, hover Close/×, native pinned tabs first and inert');
 await page.locator('[data-space-id="__open_tabs__"]').click({button:'right'});
 assert.match(await page.locator('dialog[open] .close-all-description').textContent(),/this Chrome window/);
 const beforeCancel=await page.evaluate(()=>fixture.tabs.length);
 await page.locator('dialog[open]').getByRole('button',{name:'Cancel',exact:true}).click();
 assert.equal(await page.evaluate(()=>fixture.tabs.length),beforeCancel);
 // Search must not restrict the group-close target set.
 await page.evaluate(()=>{const search=document.querySelector('#search');search.value='Saved A';search.dispatchEvent(new Event('input',{bubbles:true}));});
 await page.locator('[data-chrome-group-id="2"] .close-tab-group').click();
 await page.waitForFunction(()=>!fixture.tabs.some(tab=>tab.windowId===1 && tab.groupId===2));
 assert.equal(await page.evaluate(()=>fixture.tabs.some(tab=>tab.id===21 && tab.windowId===2)),true);
 assert.equal(await page.evaluate(()=>fixture.tabs.some(tab=>tab.id===40)),true);
 await page.evaluate(()=>{const search=document.querySelector('#search');search.value='';search.dispatchEvent(new Event('input',{bubbles:true}));});
 await page.locator('[data-space-id="__open_tabs__"]').click({button:'right'});
 await page.locator('dialog[open] [data-close-all-tabs]').click();
 await page.waitForFunction(()=>!fixture.tabs.some(tab=>tab.windowId===1 && !tab.pinned));
 assert.equal(await page.evaluate(()=>fixture.tabs.some(tab=>tab.windowId===2)),true);
 assert.equal(await page.evaluate(()=>fixture.tabs.some(tab=>tab.id===999 && tab.pinned)),true);
 assert.equal(await page.evaluate(()=>fixture.data.local.arcSidebarModel.spaces[0].children.length),46);
 console.log('PASS real Chrome: Open tabs grouped in tab-bar order, group close during search, close-all cancel/confirm scoped to current window, saved items retained');
 const resetSidebar=async()=>{
  await page.evaluate(()=>chrome.storage.local.set({arcSidebarModel:{version:2,favorites:[],spaces:[],stats:{spaces:0,folders:0,tabs:0,favorites:0}},arcSidebarState:{currentSpaceId:null,collapsedFolders:{}}}));
  await page.waitForSelector('.empty-state');
 };
 await resetSidebar();
 await page.locator('#addPinned').click();
 await page.waitForSelector('#itemDialogTitle');
 await page.locator('#itemCancel').click();
 assert.equal(await page.evaluate(()=>fixture.data.local.arcSidebarModel.spaces.length),0);
 await page.locator('#addPinned').click();
 await page.locator('#itemUrl').fill('https://first.test');
 await page.locator('#itemSave').click();
 await page.waitForFunction(()=>fixture.data.local.arcSidebarModel.spaces[0]?.children.length===1);
 assert.equal(await page.evaluate(()=>fixture.data.local.arcSidebarModel.spaces[0].title),'My Space');
 assert.equal(await page.evaluate(()=>fixture.data.local.arcSidebarState.currentSpaceId),'__my_space__');
 await resetSidebar();
 await page.locator('#addFolder').click();await page.locator('#folderCancel').click();
 assert.equal(await page.evaluate(()=>fixture.data.local.arcSidebarModel.spaces.length),0);
 await page.locator('#addFolder').click();await page.locator('#folderName').fill('First folder');await page.locator('#folderSave').click();
 await page.waitForFunction(()=>fixture.data.local.arcSidebarModel.spaces[0]?.children[0]?.type==='folder');
 assert.equal(await page.evaluate(()=>fixture.data.local.arcSidebarState.currentSpaceId),'__my_space__');
 console.log('PASS real Chrome: first pinned link/folder creates and selects My Space; cancel leaves no Space');
 // The same destination picker is shared by link, Favorite and folder editors.
 await page.locator('#addPinned').click();
 assert.equal(await page.locator('#itemSpace option').first().getAttribute('value'),'__favorites__');
 await page.locator('#itemSpace').selectOption('__favorites__');
 await page.locator('#itemUrl').fill('https://shared-picker.test');
 await page.locator('#itemSave').click();
 await page.waitForFunction(()=>fixture.data.local.arcSidebarModel.favorites.some(item=>item.url==='https://shared-picker.test'));
 const favoriteId=await page.evaluate(()=>fixture.data.local.arcSidebarModel.favorites[0].id);
 await page.locator(`[data-favorite-id="${favoriteId}"]`).click({button:'right'});
 await page.locator('#itemSpace').selectOption('__my_space__');
 await page.locator('#itemSave').click();
 await page.waitForFunction(()=>fixture.data.local.arcSidebarModel.favorites.length===0);
 assert.equal(await page.evaluate(id=>fixture.data.local.arcSidebarModel.spaces[0].children.some(item=>item.id===id),favoriteId),true);
 await page.locator('#addFolder').click();
 assert.equal(await page.locator('#folderSpace option').first().getAttribute('value'),'__favorites__');
 assert.equal(await page.locator('#folderSpace option').first().isDisabled(),true);
 await page.locator('#folderCancel').click();
 await page.evaluate(()=>{fixture.tabs.push({id:777,windowId:1,index:30,groupId:-1,title:'Favorite from open tab',url:'https://live-favorite.test'});chrome.tabs.onCreated.emit(fixture.tabs.at(-1));});
 await page.locator('[data-space-id="__open_tabs__"]').click();
 await page.waitForFunction(()=>document.querySelector('[data-live-tab-id="777"]')?.dataset.openPinManaged==='1');
 await page.locator('[data-live-tab-id="777"]').click({button:'right'});
 assert.equal(await page.locator('#openPinSpace option').first().getAttribute('value'),'__favorites__');
 await page.locator('#openPinSpace').selectOption('__favorites__');
 assert.equal(await page.locator('#openPinFolder').isVisible(),false);
 await page.locator('#openPinSave').click();
 await page.waitForFunction(()=>fixture.data.local.arcSidebarModel.favorites.some(item=>item.url==='https://live-favorite.test'));
 assert.equal(await page.evaluate(()=>{const item=fixture.data.local.arcSidebarModel.favorites.find(item=>item.url==='https://live-favorite.test');return fixture.data.session.arcSidebarBindings[item.id];}),777);
 console.log('PASS real Chrome: shared Favorites-first destination picker creates Favorites, moves existing links with stable IDs and protects folders');
 assert.deepEqual(errors,[]);console.log('PASS real Chrome: Space workflow rendering, drag-to-pin/pin/activate/close, group changes and Open-tabs view');
}finally{await browser.close();await new Promise(resolve=>server.close(resolve));}
