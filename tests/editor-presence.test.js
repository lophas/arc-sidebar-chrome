import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
test('editor reports target their owning parent/background, never the newly active tab; teardown reports closed',async()=>{
 const events={},messages=[],reports=[];let dialogOpen=true;
 const parent={postMessage:message=>messages.push(message)};
 const context={URLSearchParams,location:{search:'?overlay=1'},document:{querySelector:()=>dialogOpen?{}:null,documentElement:{}},window:{parent,addEventListener:(type,fn)=>events[type]=fn},chrome:{runtime:{sendMessage:async message=>reports.push(message)},tabs:{query(){throw Error('Must not query currently active tab');}}},MutationObserver:class{observe(){}disconnect(){}}};
 vm.createContext(context);vm.runInContext(fs.readFileSync('src/sidepanel/editor-presence.js','utf8'),context);
 await Promise.resolve();assert.equal(reports[0].open,true);assert.equal(messages[0].open,true);
 events.pagehide();await Promise.resolve();assert.equal(reports.at(-1).open,false);assert.equal(messages.at(-1).open,false);
 events.pageshow();await Promise.resolve();assert.equal(reports.at(-1).open,true);
 dialogOpen=false;events.message({source:parent,data:{type:'arc-sidebar-overlay-visibility',open:true}});await Promise.resolve();assert.equal(reports.at(-1).open,false);
 assert.ok(reports.every(message=>message.type==='arc-sidebar-editor-presence'));
});
test('background forwards editor state only to sender.tab and rejects unowned requests',async()=>{
 let listener, activated;const sent=[];
 const chrome={runtime:{id:'test',getURL:path=>'chrome-extension://test/'+path,onMessage:{addListener:fn=>listener=fn}},tabs:{onActivated:{addListener:fn=>activated=fn},sendMessage:async(id,message)=>sent.push([id,message])}};
 const context={chrome};vm.createContext(context);
 const code=fs.readFileSync('src/background/service-worker.js','utf8').split('// Forward editor locks only to the content script that owns the iframe.')[1];
 vm.runInContext(code,context);
 listener({type:'arc-sidebar-editor-presence',open:true},{id:'test',url:'chrome-extension://test/src/sidepanel/index.html',tab:{id:23}},()=>{});
 await Promise.resolve();assert.equal(sent[0][0],23);
 listener({type:'arc-sidebar-editor-presence',open:true},{id:'test',url:'chrome-extension://test/src/sidepanel/index.html'},()=>{});
 listener({type:'arc-sidebar-editor-presence',open:true},{id:'other',url:'https://page.test',tab:{id:99}},()=>{});
 assert.equal(sent.length,1);
 activated({tabId:42});await Promise.resolve();
 assert.equal(sent[1][0],42);assert.equal(sent[1][1].type,'arc-sidebar-tab-activated');
});
