import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
function setup(overlay) {
 const listeners={window:{},document:{}},events=[];
 const surface=name=>({addEventListener(type,fn){(listeners[name][type]||=[]).push(fn);}});
 const window={...surface('window'),parent:{},dispatchEvent:event=>events.push(event)};
 const document={...surface('document'),visibilityState:'visible',querySelector:()=>null};
 const context={window,document,location:{search:overlay?'?overlay=1':''},URLSearchParams,CustomEvent:class{constructor(type,options){this.type=type;this.detail=options.detail;}}};
 vm.createContext(context);vm.runInContext(fs.readFileSync('src/sidepanel/lifecycle.js','utf8').replace(/export /g,'')+'\nglobalThis.active=isSidebarActive;',context);
 return {context,events,emit:(name,type,event)=>listeners[name][type]?.forEach(fn=>fn(event))};
}
test('overlay stays asleep until its actual parent opens it',()=>{const {context:c,emit}=setup(true);assert.equal(c.active(),false);emit('window','message',{source:{},data:{type:'arc-sidebar-overlay-visibility',open:true}});assert.equal(c.active(),false);emit('window','message',{source:c.window.parent,data:{type:'arc-sidebar-overlay-visibility',open:true}});assert.equal(c.active(),true);emit('window','message',{source:c.window.parent,data:{type:'arc-sidebar-overlay-visibility',open:false}});assert.equal(c.active(),false);});
test('hidden tabs suspend even a requested-open overlay, and restore correctly',()=>{const {context:c,emit,events}=setup(true);emit('window','message',{source:c.window.parent,data:{type:'arc-sidebar-overlay-visibility',open:true}});c.document.visibilityState='hidden';emit('document','visibilitychange');assert.equal(c.active(),false);c.document.visibilityState='visible';emit('document','visibilitychange');assert.equal(c.active(),true);assert.deepEqual(events.map(e=>e.detail.active),[true,false,true]);});
test('native sidebar is active without parent messaging and resumes from BFCache',()=>{const {context:c,emit}=setup(false);assert.equal(c.active(),true);emit('window','pagehide');assert.equal(c.active(),false);emit('window','pageshow');assert.equal(c.active(),true);});
