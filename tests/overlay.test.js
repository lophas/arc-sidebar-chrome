import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import vm from 'node:vm';
function setup(mode='overlay',side='right',timeout) {
 const events={window:{},document:{}},changes=[],messages=[],observers=[],timers=new Map(),mutations=new Set();const delays=[];let seq=0,styleWrites=0;
 const mutate=target=>observers.filter(o=>o.targets.has(target)).forEach(o=>mutations.add(o));
 const listener=(map,name,fn)=>(map[name]||=[]).push(fn);
 const element=()=>({id:'',parentNode:null,hidden:false,remove(){this.parentNode=null;},attributes:new Map(),events:{},style:{properties:new Map(),setProperty(n,v,p){styleWrites++;this.properties.set(n,{v,p});mutate(this.owner);},getPropertyValue(n){const value=this.properties.get(n)?.v||'';return n==='all'&&this.properties.size>1?'':value;},getPropertyPriority(n){return this.properties.get(n)?.p||'';}},classList:{values:new Set(),add(...names){names.forEach(n=>this.values.add(n));},remove(...names){names.forEach(n=>this.values.delete(n));}},addEventListener(n,fn){listener(this.events,n,fn);},removeEventListener(){},hasAttribute(n){return this.attributes.has(n);},removeAttribute(n){this.attributes.delete(n);},setPointerCapture(){},hasPointerCapture(){return false;},contains(){return false;}});
 const nodes={'.edge':element(),'.panel':element(),iframe:element(),'.resize-handle':element()};
 Object.defineProperty(nodes.iframe,'src',{get(){return this.attributes.get('src');},set(v){this.attributes.set('src',v);}});
 nodes.iframe.contentWindow={postMessage:message=>messages.push(message)};
 const shadow={querySelector:selector=>nodes[selector]};const host=element();host.attachShadow=()=>shadow;
 host.style.owner=host;
 let cssText='';Object.defineProperty(host.style,'cssText',{get(){return cssText;},set(value){styleWrites++;cssText=value.replace(/0px/g,'0px');mutate(host);}});
 const root=()=>({append(node){node.parentNode=this;}});
 const document={documentElement:root(),visibilityState:'visible',createElement:()=>host,addEventListener:(n,fn)=>listener(events.document,n,fn)};
 const window={innerWidth:1000,addEventListener:(n,fn)=>listener(events.window,n,fn),matchMedia:()=>({matches:false,addEventListener(){}})};window.top=window;
 const chrome={storage:{local:{get:async()=>({arcSidebarMode:mode,arcSidebarAutohideTimeout:timeout}),set:async()=>{}},onChanged:{addListener:fn=>changes.push(fn)}},runtime:{getURL:path=>'chrome-extension://test/'+path,sendMessage:async message=>message.type==='arc-sidebar-panel-layout'?{side:chrome.panelSide}:{open:false},onMessage:{addListener:fn=>changes.push(fn)}}};
 chrome.panelSide=side;
 const context={document,window,chrome,URL,Node:class{},MutationObserver:class{constructor(fn){this.fn=fn;observers.push(this);}targets=new Set();observe(target){this.targets.add(target);}disconnect(){this.targets.clear();mutations.delete(this);}},setTimeout:(fn,delay)=>{delays.push(delay);timers.set(++seq,fn);return seq;},clearTimeout:id=>timers.delete(id)};
 vm.createContext(context);vm.runInContext(fs.readFileSync('src/overlay/overlay.js','utf8'),context);
 return {delays,context,nodes,host,messages,observers,changes,styleWrites:()=>styleWrites,drainMutations:()=>{let rounds=0;while(mutations.size){if(++rounds>20)throw new Error('Mutation observer starved page event loop');const pending=[...mutations];mutations.clear();pending.forEach(o=>o.fn());}return rounds;},emit:(surface,type,event)=>(events[surface][type]||[]).forEach(fn=>fn(event)),tick:()=>{const fns=[...timers.values()];timers.clear();fns.forEach(fn=>fn());}};
}
async function settled(){for(let i=0;i<12;i++)await Promise.resolve();}
test('lazy overlay loads only on hover and releases idle hidden-tab UI',async()=>{const s=setup();await settled();assert.equal(s.nodes.iframe.hasAttribute('src'),false);s.emit('document','pointermove',{isTrusted:true,movementX:1,movementY:0,clientX:999});s.tick();assert.equal(s.nodes.iframe.hasAttribute('src'),true);assert.equal(s.nodes['.panel'].classList.values.has('open'),true);assert.equal(s.messages.at(-1).open,true);s.context.document.visibilityState='hidden';s.emit('document','visibilitychange');assert.equal(s.nodes.iframe.hasAttribute('src'),false);assert.equal(s.nodes['.panel'].classList.values.has('open'),false);});
test('open editors survive tab switches and hidden native mode never loads UI',async()=>{const s=setup();await settled();s.emit('document','pointermove',{isTrusted:true,movementX:1,movementY:0,clientX:999});s.tick();s.changes.forEach(fn=>fn({type:'arc-sidebar-editor-state',open:true}));s.context.document.visibilityState='hidden';s.emit('document','visibilitychange');assert.equal(s.nodes.iframe.hasAttribute('src'),true);assert.equal(s.messages.at(-1).open,false);const native=setup('native');await settled();native.emit('document','pointermove',{isTrusted:true,movementX:1,movementY:0,clientX:999});native.tick();assert.equal(native.nodes.iframe.hasAttribute('src'),false);});
test('DOM repair reuses the same overlay host without duplicating listeners',async()=>{const s=setup();await settled();const original=s.host;for(let i=0;i<5;i++){s.host.parentNode=null;s.observers.forEach(o=>o.fn());s.tick();assert.equal(s.host.parentNode,s.context.document.documentElement);}assert.equal(s.host,original);assert.equal(s.observers.length,3);s.context.document.documentElement={append(node){node.parentNode=this;}};s.observers.forEach(o=>o.fn());s.tick();assert.equal(s.host.parentNode,s.context.document.documentElement);});

test('host style repairs cannot recursively starve page loading',async()=>{
 const s=setup();await settled();s.drainMutations();s.tick();s.drainMutations();
 const before=s.styleWrites();s.host.style.cssText='display: none !important;';
 assert.equal(s.drainMutations(),1);assert.equal(s.styleWrites(),before+1);
 s.tick();assert.equal(s.drainMutations(),0);assert.equal(s.styleWrites(),before+2);
 s.observers.forEach(o=>o.fn());s.tick();assert.equal(s.styleWrites(),before+2);
});
test('pagehide cancels queued repairs until pageshow',async()=>{
 const s=setup();await settled();s.host.parentNode=null;s.observers.forEach(o=>o.fn());
 s.emit('window','pagehide');s.tick();assert.equal(s.host.parentNode,null);
 s.emit('window','pageshow');assert.equal(s.host.parentNode,s.context.document.documentElement);
});
test('editor state cannot open another closed overlay, and tab return requires fresh hover',async()=>{
 const s=setup();await settled();
 s.changes.forEach(fn=>fn({type:'arc-sidebar-editor-state',open:true}));
 assert.equal(s.nodes['.panel'].classList.values.has('open'),false);
 assert.equal(s.nodes.iframe.hasAttribute('src'),false);
 s.emit('document','pointermove',{isTrusted:true,movementX:1,movementY:0,clientX:999});s.tick();
 s.changes.forEach(fn=>fn({type:'arc-sidebar-editor-state',open:true}));
 s.context.document.visibilityState='hidden';s.emit('document','visibilitychange');
 assert.equal(s.nodes['.panel'].classList.values.has('open'),false);
 assert.equal(s.nodes.iframe.hasAttribute('src'),true,'unsaved editor contents preserved');
 s.context.document.visibilityState='visible';s.emit('document','visibilitychange');s.emit('window','focus');s.tick();
 assert.equal(s.nodes['.panel'].classList.values.has('open'),false);
 s.emit('document','pointermove',{isTrusted:true,movementX:1,movementY:0,clientX:999});s.tick();
 assert.equal(s.nodes['.panel'].classList.values.has('open'),true);
});
test('hidden tabs cannot start delayed hover opens, and pagehide drops the visible panel state',async()=>{
 const s=setup();await settled();s.emit('document','pointermove',{isTrusted:true,movementX:1,movementY:0,clientX:999});
 s.context.document.visibilityState='hidden';s.tick();assert.equal(s.nodes['.panel'].classList.values.has('open'),false);
 s.context.document.visibilityState='visible';s.emit('document','pointermove',{isTrusted:true,movementX:1,movementY:0,clientX:999});s.tick();
 s.emit('window','pagehide');s.emit('window','pageshow');s.tick();
 assert.equal(s.nodes['.panel'].classList.values.has('open'),false);
});

test('left edge opens only from the left, closes away from the panel and resizes inward',async()=>{
 const s=setup('overlay','left');await settled();
 assert.equal(s.nodes['.panel'].classList.values.has('left'),true);
 assert.equal(s.nodes['.resize-handle'].style.left,'383px');
 s.emit('document','pointermove',{isTrusted:true,movementX:1,movementY:0,clientX:999});s.tick();
 assert.equal(s.nodes['.panel'].classList.values.has('open'),false);
 s.emit('document','pointermove',{isTrusted:true,movementX:1,movementY:0,clientX:1});s.tick();
 assert.equal(s.nodes['.panel'].classList.values.has('open'),true);
 const handle=s.nodes['.resize-handle'];
 handle.events.pointerdown[0]({button:0,clientX:390,pointerId:1,preventDefault(){},stopPropagation(){}});
 handle.events.pointermove[0]({clientX:440});
 assert.equal(s.nodes['.panel'].style.width,'440px');
 assert.equal(handle.style.left,'433px');
 await handle.events.pointerup[0]({pointerId:1});
 s.emit('document','pointermove',{isTrusted:true,movementX:1,movementY:0,clientX:600});s.tick();
 assert.equal(s.nodes['.panel'].classList.values.has('open'),false);
});
test('focus refresh updates an existing overlay without losing resize geometry',async()=>{
 const s=setup();await settled();
 const change=async value=>{s.context.chrome.panelSide=value;s.emit('window','focus');await settled();};
 s.emit('document','pointermove',{isTrusted:true,movementX:1,movementY:0,clientX:999});
 await change('left');s.tick();
 assert.equal(s.nodes['.panel'].classList.values.has('open'),false,'old-edge delayed hover is cancelled');
 s.emit('document','pointermove',{isTrusted:true,movementX:1,movementY:0,clientX:1});s.tick();
 assert.equal(s.nodes['.panel'].classList.values.has('open'),true);
 assert.equal(s.nodes['.panel'].classList.values.has('left'),true);
 await change('right');
 assert.equal(s.nodes['.panel'].classList.values.has('left'),false);
 assert.equal(s.nodes['.resize-handle'].style.left,'auto');
 assert.equal(s.nodes['.resize-handle'].style.right,'383px');
 s.emit('document','pointermove',{isTrusted:true,movementX:1,movementY:0,clientX:1});s.tick();
 assert.equal(s.nodes['.panel'].classList.values.has('open'),false);
 s.emit('document','pointermove',{isTrusted:true,movementX:1,movementY:0,clientX:999});s.tick();
 assert.equal(s.nodes['.panel'].classList.values.has('open'),true);
});

test('Chrome layout changes remain dormant until focus and also apply on tab return',async()=>{
 const s=setup();await settled();
 s.context.chrome.panelSide='left';s.tick();
 assert.equal(s.nodes['.panel'].classList.values.has('left'),false);
 s.emit('window','focus');await settled();
 assert.equal(s.nodes['.panel'].classList.values.has('left'),true);
 s.context.document.visibilityState='hidden';s.emit('document','visibilitychange');
 s.context.chrome.panelSide='right';
 s.context.document.visibilityState='visible';s.emit('document','visibilitychange');await settled();
 assert.equal(s.nodes['.panel'].classList.values.has('left'),false);
});

test('every supported timeout controls delayed closing; zero disables overlay even with a legacy overlay preference',async()=>{
 for(const timeout of [500,600,700,800,900,1000,1100]){
  const s=setup('overlay','right',timeout);await settled();
  s.emit('document','pointermove',{isTrusted:true,movementX:1,movementY:0,clientX:999});s.tick();
  s.emit('document','pointermove',{isTrusted:true,movementX:1,movementY:0,clientX:100});
  assert.equal(s.delays.at(-1),timeout);
  assert.equal(s.nodes['.panel'].classList.values.has('open'),true);
  s.tick();assert.equal(s.nodes['.panel'].classList.values.has('open'),false);
 }
 const s=setup('overlay','right',0);await settled();
 s.emit('document','pointermove',{isTrusted:true,movementX:1,movementY:0,clientX:999});s.tick();
 assert.equal(s.nodes.iframe.hasAttribute('src'),false);
});

test('stationary pointer and synthesized enter on tab return cannot open; activation clears editor locks',async()=>{
 const s=setup();await settled();
 s.nodes['.edge'].events.mouseenter?.forEach(fn=>fn({}));
 s.emit('document','pointermove',{isTrusted:true,movementX:0,movementY:0,clientX:999});s.tick();
 assert.equal(s.nodes['.panel'].classList.values.has('open'),false);
 s.emit('document','pointermove',{isTrusted:true,movementX:1,movementY:0,clientX:999});s.tick();
 s.emit('window','message',{source:s.nodes.iframe.contentWindow,data:{type:'arc-sidebar-editor-state',open:true}});
 s.changes.forEach(fn=>fn({type:'arc-sidebar-tab-activated'}));
 assert.equal(s.nodes['.panel'].classList.values.has('open'),false);
 s.emit('document','pointermove',{isTrusted:true,movementX:1,movementY:0,clientX:999});s.tick();
 s.emit('document','pointermove',{clientX:100});s.tick();
 assert.equal(s.nodes['.panel'].classList.values.has('open'),false,'stale editor lock cannot keep the reopened panel visible');
});

test('fresh profile stays fixed; explicit active refresh and later focus apply modes without reload', async () => {
 const s=setup('native'); await settled();
 s.context.chrome.storage.local.get=async()=>({});
 s.emit('window','focus'); await settled();
 s.emit('document','pointermove',{isTrusted:true,movementX:1,movementY:0,clientX:999});s.tick();
 assert.equal(s.nodes.iframe.hasAttribute('src'),false);
 s.context.chrome.storage.local.get=async()=>({arcSidebarMode:'overlay',arcSidebarAutohideTimeout:600});
 s.changes.forEach(fn=>fn({type:'arc-sidebar-refresh-mode'}));await settled();
 s.emit('document','pointermove',{isTrusted:true,movementX:1,movementY:0,clientX:999});s.tick();
 assert.equal(s.nodes['.panel'].classList.values.has('open'),true);
 s.context.chrome.storage.local.get=async()=>({arcSidebarMode:'native',arcSidebarAutohideTimeout:600});
 // Inactive pages do not receive storage broadcasts and keep their applied mode until focus.
 assert.equal(s.nodes['.panel'].classList.values.has('open'),true);
 s.emit('window','focus');await settled();
 assert.equal(s.nodes['.panel'].classList.values.has('open'),false);
});

test('extension reload catches synchronous storage throws and disposes obsolete overlay without another API call',async()=>{
 const s=setup();await settled();
 s.emit('document','pointermove',{isTrusted:true,movementX:1,movementY:0,clientX:999});s.tick();
 assert.equal(s.nodes['.panel'].classList.values.has('open'),true);
 let calls=0;s.context.chrome.storage.local.get=()=>{calls++;throw new Error('Extension context invalidated.');};
 s.emit('window','focus');await settled();
 assert.equal(calls,1);assert.equal(s.host.parentNode,null);
 assert.equal(s.nodes['.panel'].classList.values.has('open'),false);
 assert.equal(s.nodes.iframe.hasAttribute('src'),false);
 assert.equal(s.observers.every(observer=>observer.targets.size===0),true);
 s.emit('window','focus');s.emit('window','pageshow');s.emit('document','pointermove',{isTrusted:true,movementX:1,movementY:0,clientX:999});s.tick();await settled();
 assert.equal(calls,1);assert.equal(s.host.parentNode,null);
});
test('rejected runtime promises invalidate the old overlay and cancel pending edge opens',async()=>{
 const s=setup();await settled();
 s.emit('document','pointermove',{isTrusted:true,movementX:1,movementY:0,clientX:999});
 s.context.chrome.runtime.sendMessage=()=>Promise.reject(new Error('Extension context invalidated.'));
 s.emit('window','focus');await settled();s.tick();
 assert.equal(s.host.parentNode,null);assert.equal(s.nodes['.panel'].classList.values.has('open'),false);
 assert.equal(s.nodes.iframe.hasAttribute('src'),false);
});
