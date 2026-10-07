import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import vm from 'node:vm';
function setup(mode='overlay') {
 const events={window:{},document:{}},changes=[],messages=[],observers=[],timers=new Map(),mutations=new Set();let seq=0,styleWrites=0;
 const mutate=target=>observers.filter(o=>o.targets.has(target)).forEach(o=>mutations.add(o));
 const listener=(map,name,fn)=>(map[name]||=[]).push(fn);
 const element=()=>({id:'',parentNode:null,hidden:false,attributes:new Map(),events:{},style:{properties:new Map(),setProperty(n,v,p){styleWrites++;this.properties.set(n,{v,p});mutate(this.owner);},getPropertyValue(n){const value=this.properties.get(n)?.v||'';return n==='all'&&this.properties.size>1?'':value;},getPropertyPriority(n){return this.properties.get(n)?.p||'';}},classList:{values:new Set(),add(...names){names.forEach(n=>this.values.add(n));},remove(...names){names.forEach(n=>this.values.delete(n));}},addEventListener(n,fn){listener(this.events,n,fn);},removeEventListener(){},hasAttribute(n){return this.attributes.has(n);},removeAttribute(n){this.attributes.delete(n);},setPointerCapture(){},hasPointerCapture(){return false;},contains(){return false;}});
 const nodes={'.edge':element(),'.panel':element(),iframe:element(),'.resize-handle':element()};
 Object.defineProperty(nodes.iframe,'src',{get(){return this.attributes.get('src');},set(v){this.attributes.set('src',v);}});
 nodes.iframe.contentWindow={postMessage:message=>messages.push(message)};
 const shadow={querySelector:selector=>nodes[selector]};const host=element();host.attachShadow=()=>shadow;
 host.style.owner=host;
 let cssText='';Object.defineProperty(host.style,'cssText',{get(){return cssText;},set(value){styleWrites++;cssText=value.replace(/0px/g,'0px');mutate(host);}});
 const root=()=>({append(node){node.parentNode=this;}});
 const document={documentElement:root(),visibilityState:'visible',createElement:()=>host,addEventListener:(n,fn)=>listener(events.document,n,fn)};
 const window={innerWidth:1000,addEventListener:(n,fn)=>listener(events.window,n,fn),matchMedia:()=>({matches:false,addEventListener(){}})};window.top=window;
 const chrome={storage:{local:{get:async key=>key==='arcSidebarMode'?{arcSidebarMode:mode}:{},set:async()=>{}},onChanged:{addListener:fn=>changes.push(fn)}},runtime:{getURL:path=>'chrome-extension://test/'+path,sendMessage:async()=>({open:false}),onMessage:{addListener:fn=>changes.push(fn)}}};
 const context={document,window,chrome,URL,Node:class{},MutationObserver:class{constructor(fn){this.fn=fn;observers.push(this);}targets=new Set();observe(target){this.targets.add(target);}disconnect(){this.targets.clear();mutations.delete(this);}},setTimeout:fn=>{timers.set(++seq,fn);return seq;},clearTimeout:id=>timers.delete(id)};
 vm.createContext(context);vm.runInContext(fs.readFileSync('src/overlay/overlay.js','utf8'),context);
 return {context,nodes,host,messages,observers,changes,styleWrites:()=>styleWrites,drainMutations:()=>{let rounds=0;while(mutations.size){if(++rounds>20)throw new Error('Mutation observer starved page event loop');const pending=[...mutations];mutations.clear();pending.forEach(o=>o.fn());}return rounds;},emit:(surface,type,event)=>(events[surface][type]||[]).forEach(fn=>fn(event)),tick:()=>{const fns=[...timers.values()];timers.clear();fns.forEach(fn=>fn());}};
}
async function settled(){await Promise.resolve();await Promise.resolve();await Promise.resolve();}
test('lazy overlay loads only on hover and releases idle hidden-tab UI',async()=>{const s=setup();await settled();assert.equal(s.nodes.iframe.hasAttribute('src'),false);s.emit('document','pointermove',{clientX:999});s.tick();assert.equal(s.nodes.iframe.hasAttribute('src'),true);assert.equal(s.nodes['.panel'].classList.values.has('open'),true);assert.equal(s.messages.at(-1).open,true);s.context.document.visibilityState='hidden';s.emit('document','visibilitychange');assert.equal(s.nodes.iframe.hasAttribute('src'),false);assert.equal(s.nodes['.panel'].classList.values.has('open'),false);});
test('open editors survive tab switches and hidden native mode never loads UI',async()=>{const s=setup();await settled();s.emit('document','pointermove',{clientX:999});s.tick();s.changes.forEach(fn=>fn({type:'arc-sidebar-editor-state',open:true}));s.context.document.visibilityState='hidden';s.emit('document','visibilitychange');assert.equal(s.nodes.iframe.hasAttribute('src'),true);assert.equal(s.messages.at(-1).open,false);const native=setup('native');await settled();native.emit('document','pointermove',{clientX:999});native.tick();assert.equal(native.nodes.iframe.hasAttribute('src'),false);});
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
