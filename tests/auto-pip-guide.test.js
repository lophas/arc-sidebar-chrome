import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const source=fs.readFileSync('src/media/auto-pip-bridge.js','utf8');
const KEY='arcSidebarAutoPipEnabled';
const DISMISS_KEY='arcSidebarAutoPipGuideDismissed:https://video.test';
const tick=()=>new Promise(resolve=>setImmediate(resolve));
function setup({stored={},deferred=false}={}){
 const listeners={},calls=[],copied=[],data={...stored};let popup=null,resolveRead,builds=0;
 const event=name=>({addListener:fn=>(listeners[name]||=[]).push(fn),removeListener:fn=>{listeners[name]=listeners[name].filter(x=>x!==fn);}});
 const emit=(name,...args)=>listeners[name]?.forEach(fn=>fn(...args));
 const chrome={runtime:{id:'test',onMessage:event('message'),sendMessage:async m=>{calls.push(m);return {ok:true};}},storage:{local:{get:()=>deferred?new Promise(resolve=>{resolveRead=resolve;}):Promise.resolve({...data}),set:async values=>{Object.assign(data,values);emit('storage',Object.fromEntries(Object.entries(values).map(([key,value])=>[key,{newValue:value}])),'local');}},onChanged:event('storage')}};
 const document={visibilityState:'visible',addEventListener:(name,fn)=>{listeners[name]=[fn];},removeEventListener:name=>{delete listeners[name];},body:{append:host=>{popup=host;}}};
 document.createElement=()=>{
  builds++;const nodes=new Map();const node=()=>({handlers:{},open:false,addEventListener(name,fn){this.handlers[name]=fn;},showModal(){this.open=true;},close(){this.open=false;}});
  const shadow={querySelector(selector){if(!nodes.has(selector))nodes.set(selector,node());return nodes.get(selector);}};
  const host={shadow,attachShadow:()=>shadow,remove(){if(popup===host)popup=null;}};return host;
 };
 const window={};window.top=window;
 const context=vm.createContext({window,document,chrome,location:{protocol:'https:',origin:'https://video.test',host:'video.test'},navigator:{clipboard:{writeText:async value=>copied.push(value)}}});
 vm.runInContext(source,context);
 const focus=async(active,at,values={})=>{emit('message',{type:'arc-auto-pip-guide-focus',active,changedAt:at,guide:{eligible:true,lastAutomaticOpenAt:0,hasPip:false,opening:false,...values}},{id:'test'});await tick();};
 return {context,document,chrome,calls,copied,data,focus,builds:()=>builds,popup:()=>popup,emit,resolveRead:values=>resolveRead(values),click:async selector=>{const button=popup.shadow.querySelector(selector);await button.handlers.click({currentTarget:button});await tick();}};
}
test('guide appears only after an eligible failed switch, with a once-per-visit dismissal',async()=>{
 const s=setup();await s.focus(true,1000);assert.equal(s.popup(),null);
 await s.focus(false,2000);assert.equal(s.popup(),null);
 await s.focus(true,4000);assert.equal(s.popup().shadow.querySelector('dialog').open,true);
 assert.equal(s.popup().shadow.querySelector('#siteAddress').value,'https://video.test');
 await s.click('#later');assert.equal(s.popup(),null);
 await s.focus(false,5000);await s.focus(true,7000);assert.equal(s.popup(),null);assert.equal(s.builds(),1);
});
test('working/manual PiP, paused videos, quick switches, disabled and dismissed sites do not prompt',async()=>{
 const working=setup();await working.focus(false,1000);await working.focus(true,3000,{lastAutomaticOpenAt:2000});assert.equal(working.popup(),null);
 for(const stored of [{[KEY]:false},{[DISMISS_KEY]:true}]){const s=setup({stored});await s.focus(false,1000);await s.focus(true,3000);assert.equal(s.popup(),null);}
 for(const returned of [{hasPip:true},{eligible:false},{opening:true}]){const s=setup();await s.focus(false,1000);await s.focus(true,4000,returned);assert.equal(s.popup(),null);}
 const quick=setup();await quick.focus(false,1000);await quick.focus(true,1100);assert.equal(quick.popup(),null);
});
test('popup stays hidden in an inactive/hidden tab and resumes on actual return',async()=>{
 const s=setup();await s.focus(false,1000);s.document.visibilityState='hidden';await s.focus(true,3000);assert.equal(s.popup(),null);
 s.document.visibilityState='visible';s.emit('visibilitychange');await tick();assert.equal(s.popup().shadow.querySelector('dialog').open,true);
 await s.focus(false,4000);s.emit('visibilitychange');await tick();assert.equal(s.popup().shadow.querySelector('dialog').open,false);
 await s.focus(true,6000);assert.equal(s.popup().shadow.querySelector('dialog').open,true);
 await s.focus(false,7000);await s.focus(true,9000,{lastAutomaticOpenAt:8000});assert.equal(s.popup(),null,'successful playback removes an earlier guide');
});
test('explicit settings click copies only the origin; permanent dismissal is per website and off removes the popup',async()=>{
 const s=setup();await s.focus(false,1000);await s.focus(true,3000);assert.deepEqual(s.copied,[]);
 await s.click('#openSettings');assert.deepEqual(s.copied,['https://video.test']);assert.equal(s.calls.at(-1).type,'arc-auto-pip-open-settings');
 assert.equal(s.popup().shadow.querySelector('#later').textContent,'Done');
 await s.click('#dismissSite');assert.equal(s.data[DISMISS_KEY],true);assert.equal(s.popup(),null);
 const off=setup();await off.focus(false,1000);await off.focus(true,3000);off.emit('storage',{[KEY]:{newValue:false}},'local');assert.equal(off.popup(),null);
});
test('bridge reinjection is idempotent and newer preference changes win over pending reads',async()=>{
 const s=setup({deferred:true});s.emit('storage',{[KEY]:{newValue:false}},'local');s.resolveRead({});await tick();
 await s.focus(false,1000);await s.focus(true,3000);assert.equal(s.popup(),null);
 vm.runInContext(source,s.context);assert.equal(s.calls.filter(m=>m.type==='arc-auto-pip-ready').length,1);
 s.context.__arcSidebarAutoPipGuide.dispose();assert.equal(s.context.__arcSidebarAutoPipGuide,undefined);
});
