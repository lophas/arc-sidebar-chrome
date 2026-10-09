import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { sidebarPreferences } from '../src/shared/sidebar-preferences.js';
function setup({ mode='overlay', receiver=false, url='https://example.test', changeDuringInjection=false }={}) {
  const calls=[];const events={};let settings={arcSidebarMode:mode,arcSidebarAutohideTimeout:700};let ready=receiver;
  const event=name=>({addListener:fn=>events[name]=fn});
  const chrome={storage:{local:{get:async()=>settings}},tabs:{get:async id=>({id,url}),query:async()=>[],onActivated:event('activate'),onUpdated:event('update'),sendMessage:async(id,message)=>{calls.push(['message',id,message.mode]);if(!ready)throw Error('No receiver');return {version:'focus-injection-v1'};}},windows:{onFocusChanged:event('focus')},scripting:{executeScript:async request=>{calls.push([request.files?'inject':'remove',request.target.tabId]);if(request.files)ready=true;if(changeDuringInjection)settings={arcSidebarMode:'native',arcSidebarAutohideTimeout:1000};}}};
  const context={chrome,sidebarPreferences};vm.createContext(context);
  const source=fs.readFileSync('src/background/overlay-delivery.js','utf8').replace(/^import .*;\n/gm,'').replace(/export /g,'');
  vm.runInContext(source,context);
  return {calls,events,run:context.syncFocusedSidebar};
}
test('focused page without receiver is injected once; subsequent focus reuses the controller',async()=>{
 const s=setup();await s.run(7);await s.run(7);
 assert.deepEqual(s.calls,[['message',7,'overlay'],['inject',7],['message',7,'overlay'],['message',7,'overlay']]);
});
test('fixed deactivates existing script, removes stale hosts without injecting an overlay, and excludes browser pages',async()=>{
 const existing=setup({mode:'native',receiver:true});await existing.run(7);assert.deepEqual(existing.calls,[['message',7,'native']]);
 const stale=setup({mode:'native'});await stale.run(7);assert.deepEqual(stale.calls,[['message',7,'native'],['remove',7]]);
 const browser=setup({url:'chrome://settings'});await browser.run(7);assert.deepEqual(browser.calls,[]);
});
test('injection applies newest mode if preferences change while it is pending',async()=>{
 const s=setup({changeDuringInjection:true});await s.run(7);
 assert.deepEqual(s.calls,[['message',7,'overlay'],['inject',7],['message',7,'native']]);
});
