// Production-code audit only: never patches src/ or browser permissions.
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {chromium} from 'playwright-core';
const output=process.env.AUDIT_OUTPUT||'audit-results.json';
const origin='https://audit.test';
const sourceSha=execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim();
const ticks=Number(execFileSync('getconf',['CLK_TCK'],{encoding:'utf8'}).trim());
const results={sourceSha,extensionVersion:JSON.parse(await fs.readFile('manifest.json','utf8')).version,platform:os.platform(),cpu:os.cpus()[0].model,logicalCpus:os.cpus().length,totalMemory:os.totalmem(),runs:[],events:[]};
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const model=count=>({version:2,favorites:Array.from({length:8},(_,i)=>({id:'fav'+i,type:'tab',title:'Favorite '+i,url:origin+'/favorite'+i})),spaces:Array.from({length:4},(_,s)=>({id:'s'+s,title:'Space '+s,emoji:'🚀',children:Array.from({length:count/4},(_,i)=>({id:'p'+s+'-'+i,type:'tab',title:'Saved page '+i,url:origin+'/saved/'+s+'/'+i}))}))});
async function processes(profile){
 const all=[];
 for(const entry of await fs.readdir('/proc')){
  if(!/^\d+$/.test(entry))continue;
  try{const raw=await fs.readFile('/proc/'+entry+'/stat','utf8'),v=raw.slice(raw.lastIndexOf(')')+2).split(' ');all.push({pid:Number(entry),ppid:Number(v[1]),cpu:(Number(v[11])+Number(v[12]))/ticks});}catch{}
 }
 let root;
 for(const p of all){try{const cmd=await fs.readFile('/proc/'+p.pid+'/cmdline','utf8');if(cmd.includes('--user-data-dir='+profile)&&!cmd.includes('--type=')){root=p.pid;break;}}catch{}}
 if(!root)throw Error('Browser process not found');
 const ids=new Set([root]);let changed=true;while(changed){changed=false;for(const p of all)if(ids.has(p.ppid)&&!ids.has(p.pid)){ids.add(p.pid);changed=true;}}
 return all.filter(p=>ids.has(p.pid));
}
async function memory(profile){
 const ps=await processes(profile);let pss=0,rss=0;
 for(const p of ps){try{const raw=await fs.readFile('/proc/'+p.pid+'/smaps_rollup','utf8');pss+=Number(raw.match(/^Pss:\s+(\d+)/m)?.[1]||0)*1024;rss+=Number(raw.match(/^Rss:\s+(\d+)/m)?.[1]||0)*1024;}catch{}}
 return{pssBytes:pss,rssBytes:rss,processes:ps.length};
}
async function cpuWindow(profile,action){
 let previous=new Map((await processes(profile)).map(p=>[p.pid,p.cpu])),cpu=0,running=false;
 const sample=async()=>{if(running)return;running=true;try{const ps=await processes(profile);for(const p of ps)cpu+=Math.max(0,p.cpu-(previous.get(p.pid)??0));previous=new Map(ps.map(p=>[p.pid,p.cpu]));}finally{running=false;}};
 const start=performance.now(),timer=setInterval(()=>sample().catch(()=>{}),250);
 try{await action();}finally{clearInterval(timer);while(running)await sleep(5);await sample();}
 const seconds=(performance.now()-start)/1000;return{wallSeconds:seconds,cpuSeconds:cpu,oneCorePercent:100*cpu/seconds};
}
async function metric(page,gc=false){
 const c=await page.context().newCDPSession(page);try{await c.send('Performance.enable');if(gc)await c.send('HeapProfiler.collectGarbage');const m=Object.fromEntries((await c.send('Performance.getMetrics')).metrics.map(m=>[m.name,m.value]));return{heapBytes:m.JSHeapUsedSize,nodes:m.Nodes,documents:m.Documents,listeners:m.JSEventListeners,scriptSeconds:m.ScriptDuration,taskSeconds:m.TaskDuration};}finally{await c.detach();}
}
async function launch(mode){
 const profile=await fs.mkdtemp(path.join(os.tmpdir(),'arc-audit-'));
 const extension=mode!=='baseline';
 const context=await chromium.launchPersistentContext(profile,{channel:'chromium',headless:false,viewport:{width:1280,height:800},ignoreDefaultArgs:extension?['--disable-extensions']:[],args:['--no-sandbox',...(extension?[`--disable-extensions-except=${process.cwd()}`,`--load-extension=${process.cwd()}`]:[])]});
 await context.route(origin+'/**',route=>{const heavy=route.request().url().includes('/heavy');return route.fulfill({contentType:'text/html',body:'<!doctype html><title>Audit fixture</title><style>body{margin:0}#items{width:600px}span{display:block;height:2px}</style><main id="items">'+Array.from({length:heavy?20000:100},(_,i)=>'<span>Row '+i+'</span>').join('')+'</main>'});});
 let control,extensionId,worker;
 if(extension){
  [worker]=context.serviceWorkers();if(!worker)worker=await context.waitForEvent('serviceworker');extensionId=worker.url().split('/')[2];
  control=await context.newPage();await control.goto(`chrome-extension://${extensionId}/src/options/index.html`);await control.locator('#autohideTimeout').waitFor();
  await control.evaluate(async({mode,model})=>{await chrome.storage.sync.set({arcSidebarSyncEnabled:false});await chrome.storage.local.set({arcSidebarMode:mode==='fixed-off'?'native':'overlay',arcSidebarAutoPipEnabled:mode!=='fixed-off',arcSidebarModel:model,arcSidebarState:{currentSpaceId:'s0',collapsedFolders:{}}});},{mode,model:model(200)});
  await control.close();
 }
 return{context,profile,seedPage:context.pages().find(p=>p.url()==='about:blank'),extensionId,worker,close:async()=>{await context.close();await fs.rm(profile,{recursive:true,force:true});}};
}
async function memoryRun(mode,rep){
 const f=await launch(mode),pages=[],run={mode,rep,stages:[]};
 try{
  results.browserVersion=f.context.browser().version();
  for(const count of [1,20,50]){
   while(pages.length<count){const p=pages.length===0?f.seedPage:await f.context.newPage();await p.goto(origin+'/page/'+pages.length);pages.push(p);}
   await pages.at(-1).bringToFront();await sleep(1200);
   await metric(pages.at(-1),true);
   const idle=await cpuWindow(f.profile,()=>sleep(3000));
   const stage={tabs:count,idle,...await memory(f.profile),activePageTarget:await metric(pages.at(-1)),loadedSidebarFrames:pages.flatMap(p=>p.frames()).filter(frame=>frame.url().includes('/src/sidepanel/index.html')).length};
   run.stages.push(stage);console.log('AUDIT_STAGE '+JSON.stringify({mode,rep,...stage}));
  }
  if(mode==='autohide'&&rep===1){
   const page=pages.at(-1);const control=await f.context.newPage();await control.goto(`chrome-extension://${f.extensionId}/src/options/index.html`);const side=await control.evaluate(async()=>(await chrome.sidePanel.getLayout()).side);await control.close();await page.bringToFront();
   const edge=side==='left'?1:await page.evaluate(()=>document.documentElement.clientWidth-1);
   const open=async()=>{const start=performance.now();await page.mouse.move(640,300);await page.mouse.move(edge,300);let frame;for(let i=0;i<100;i++){frame=page.frames().find(f=>f.url().includes('/src/sidepanel/index.html'));if(frame)break;await sleep(10);}assert.ok(frame,'Sidebar must open');const element=await frame.frameElement();await page.waitForFunction(el=>el.parentElement.classList.contains('open'),element,{timeout:3000});await frame.locator('#pinned .row').first().waitFor();return{frame,ms:performance.now()-start};};
   try {
   await sleep(500);
   const cold=await open();run.coldOpenMs=cold.ms;run.openMemory=await memory(f.profile);
   const frameSession=await f.context.newCDPSession(cold.frame);await frameSession.send('HeapProfiler.collectGarbage');run.openSidebarHeap=await frameSession.send('Runtime.getHeapUsage');await frameSession.detach();
   await page.mouse.click(640,300);await sleep(250);run.hiddenSameTabMemory=await memory(f.profile);
   const times=[];run.cyclesCpu=await cpuWindow(f.profile,async()=>{for(let i=0;i<40;i++){const opened=await open();times.push(opened.ms);await page.mouse.click(640,300);}});run.warmOpenMs=times;
   const after=await f.context.newCDPSession(cold.frame);await after.send('HeapProfiler.collectGarbage');run.sidebarHeapAfter40Cycles=await after.send('Runtime.getHeapUsage');run.sidebarDomAfter40Cycles=await after.send('Memory.getDOMCounters');await after.detach();
   const other=pages[0];await other.bringToFront();await sleep(500);await metric(page,true);run.afterTabSwitchMemory=await memory(f.profile);run.framesAfterSwitch=pages.flatMap(p=>p.frames()).filter(frame=>frame.url().includes('/src/sidepanel/index.html')).length;
   await page.bringToFront();const reopened=await open();await reopened.frame.locator('#openCommandBar').click();await sleep(200);run.searchOpenMemory=await memory(f.profile);await reopened.frame.locator('dialog[open]').first().press('Escape');await page.mouse.click(640,300);
   await other.bringToFront();await sleep(300);
   } catch(error) {run.sidebarMeasurementError=error.message;console.log('AUDIT_SIDEBAR_ERROR '+error.message);}
  }
 }finally{await f.close();}
 results.runs.push(run);await fs.writeFile(output,JSON.stringify(results,null,2));
}
async function eventRun(){
 const f=await launch('autohide');
 try{
  const pages=[];for(let i=0;i<20;i++){const p=i===0?f.seedPage:await f.context.newPage();await p.goto(origin+(i===0?'/heavy':'/light/'+i));pages.push(p);}
  const control=await f.context.newPage();await control.goto(`chrome-extension://${f.extensionId}/src/options/index.html`);await sleep(500);
  await f.worker.evaluate(()=>{
   globalThis.auditCounts={};globalThis.auditEvents={};
   const hook=(name,api,methods)=>{for(const method of methods){const original=api[method];api[method]=function(...args){auditCounts[name+'.'+method]=(auditCounts[name+'.'+method]||0)+1;return original.apply(this,args);};}};
   hook('tabs',chrome.tabs,['query','get','sendMessage']);hook('groups',chrome.tabGroups,['query','get','update']);hook('script',chrome.scripting,['executeScript']);
   for(const area of ['local','session','sync'])hook(area,chrome.storage[area],['get','set']);
   for(const[event,name]of[[chrome.tabs.onUpdated,'tabUpdated'],[chrome.tabs.onActivated,'tabActivated'],[chrome.storage.onChanged,'storageChanged']])event.addListener(()=>{auditEvents[name]=(auditEvents[name]||0)+1;});
  });
  const counts=()=>f.worker.evaluate(()=>({api:{...auditCounts},events:{...auditEvents}}));
  const diff=(a,b)=>({api:Object.fromEntries(Object.keys(b.api).map(k=>[k,(b.api[k]||0)-(a.api[k]||0)])),events:Object.fromEntries(Object.keys(b.events).map(k=>[k,(b.events[k]||0)-(a.events[k]||0)]))});
  await pages[1].bringToFront();await sleep(1000);
  let before=await counts();const idle=await cpuWindow(f.profile,()=>sleep(5000));results.events.push({name:'idle20tabs',cpu:idle,...diff(before,await counts())});
  before=await counts();const cpu=await cpuWindow(f.profile,async()=>{for(let i=0;i<30;i++){await pages[i%2].bringToFront();await sleep(100);}await sleep(500);});results.events.push({name:'30switches-heavy-light',cpu,...diff(before,await counts())});
  before=await counts();const burst=await cpuWindow(f.profile,async()=>{for(let i=0;i<30;i++){await pages[2].evaluate(i=>document.title='Changed '+i,i);await sleep(40);}await sleep(500);});results.events.push({name:'30backgroundTitleChanges',cpu:burst,...diff(before,await counts())});
  await control.evaluate(()=>chrome.storage.local.set({arcSidebarAutoPipEnabled:false}));await sleep(1200);
  before=await counts();const off=await cpuWindow(f.profile,async()=>{for(let i=0;i<30;i++){await pages[i%2].bringToFront();await sleep(100);}await sleep(500);});results.events.push({name:'30switches-pip-disabled',cpu:off,...diff(before,await counts())});
  // Isolate the cost of deep player discovery using the production public
  // diagnostic entrypoint. This is a microbenchmark, not an idle workload.
  for(const p of [pages[1],pages[0]]){await p.bringToFront();const samples=await p.evaluate(()=>{const times=[];for(let i=0;i<25;i++){const t=performance.now();globalThis.__arcSidebarAutoPip?.getState();times.push(performance.now()-t);}return{domNodes:document.querySelectorAll('*').length,times};});results.events.push({name:'media-scan-microbenchmark',...samples});}
  await fs.writeFile(output,JSON.stringify(results,null,2));console.log('AUDIT_EVENTS '+JSON.stringify(results.events));
 }finally{await f.close();}
}
for(let rep=1;rep<=2;rep++)for(const mode of ['baseline','autohide'])await memoryRun(mode,rep);
await memoryRun('fixed-off',1);
await eventRun();
console.log('AUDIT_RESULT '+JSON.stringify(results));
