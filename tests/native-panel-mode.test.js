import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
function setup({modern=true,native=true,documentId=true}={}) {
 const state={arcSidebarMode:'overlay',arcSidebarAutohideTimeout:1000},calls=[];
 let opened,connect;
 const chrome={runtime:{getURL:path=>'chrome-extension://test/'+path,onConnect:{addListener:fn=>connect=fn},getContexts:async filter=>{calls.push(['contexts',filter.documentIds?.[0] || 'native-view']);return native?[{documentUrl:'chrome-extension://test/src/sidepanel/index.html'}]:[];}},sidePanel:modern?{onOpened:{addListener:fn=>opened=fn}}:{}};
 const context={chrome,console,Number,commitStorage(){},createStorageClient:()=>({local:{get:async()=>({...state}),set:async values=>{Object.assign(state,values);calls.push(['set',values.arcSidebarMode]);}}}),refreshActiveSidebar:async id=>calls.push(['refresh',id])};
 vm.runInNewContext(fs.readFileSync('src/background/native-panel-reload.js','utf8').replace(/^import .*;\n/gm,''),context);
 const port=()=>{let message,disconnect;connect({name:'arc-native-sidepanel',sender:{url:'chrome-extension://test/src/sidepanel/index.html',...(documentId?{documentId:'native-doc'}:{})},onMessage:{addListener:fn=>message=fn},onDisconnect:{addListener:fn=>disconnect=fn}});return{message:value=>message(value),disconnect};};
 return{state,calls,open:info=>opened(info),port};
}
test('native opening selects Fixed, preserves timeout and refreshes only its active page without a reload',async()=>{
 const s=setup();await s.open({windowId:4,path:'/src/sidepanel/index.html'});
 assert.deepEqual(s.state,{arcSidebarMode:'native',arcSidebarAutohideTimeout:1000});assert.deepEqual(s.calls,[['set','native'],['refresh',4]]);
 // No close listener or disconnect operation writes Autohide.
 await s.open({windowId:4,path:'other.html'});assert.equal(s.calls.length,2);
 await s.open({windowId:null,path:'src/sidepanel/index.html'});assert.equal(s.calls.length,2);
});
test('older Chrome detects only an actual native panel, once per connection, and closing preserves Fixed',async()=>{
 const s=setup({modern:false});const p=s.port();await p.message({windowId:4});await p.message({windowId:4});p.disconnect();
 assert.deepEqual(s.calls,[['contexts','native-doc'],['set','native'],['refresh',4]]);assert.equal(s.state.arcSidebarMode,'native');
 const old=setup({modern:false,documentId:false});await old.port().message({windowId:4});assert.equal(old.state.arcSidebarMode,'native');
 const tab=setup({modern:false,native:false});await tab.port().message({windowId:4});assert.equal(tab.state.arcSidebarMode,'overlay');assert.deepEqual(tab.calls,[['contexts','native-doc']]);
});
