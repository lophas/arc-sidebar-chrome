import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
function setup() {
 const listeners={},frames=new Map();let serial=0,active=true,top=100;
 const scroller={get scrollTop(){return top;},set scrollTop(value){top=Math.max(0,Math.min(1000,value));},getBoundingClientRect:()=>({left:0,right:300,top:100,bottom:500,height:400})};
 const listen=(type,fn)=>{(listeners[type]||=[]).push(fn);};
 const context={isSidebarActive:()=>active,document:{querySelector:()=>scroller,addEventListener:listen,documentElement:{}},window:{addEventListener:listen},requestAnimationFrame:fn=>{frames.set(++serial,fn);return serial;},cancelAnimationFrame:id=>frames.delete(id)};
 vm.createContext(context);vm.runInContext(fs.readFileSync('src/sidepanel/drag-scroll.js','utf8').replace(/^import .*\n/gm,''),context);
 const emit=(type,event={})=>listeners[type]?.forEach(fn=>fn(event));
 const frame=time=>{const queued=[...frames.values()];frames.clear();queued.forEach(fn=>fn(time));};
 const start=()=>emit('dragstart',{target:{closest:()=>({draggable:true})}});
 const hover=(y,x=150)=>emit('dragover',{clientX:x,clientY:y});
 return {scroller,emit,frame,start,hover,frames,setActive:value=>active=value};
}
test('Dragging near either edge scrolls continuously without further pointer movement',()=>{
 const f=setup();f.start();f.hover(495);f.frame(0);const first=f.scroller.scrollTop;f.frame(16);f.frame(32);assert.ok(f.scroller.scrollTop>first && first>100);
 f.hover(105);const before=f.scroller.scrollTop;f.frame(48);assert.ok(f.scroller.scrollTop<before);
});
test('Middle/outside pointer, drop/cancel/hidden sidebar stop the animation immediately',()=>{
 for(const action of [f=>f.hover(300),f=>f.hover(495,400),f=>f.hover(600),f=>f.emit('drop'),f=>f.emit('dragend'),f=>f.emit('pagehide'),f=>{f.setActive(false);f.emit('arc-sidebar-activity',{detail:{active:false}});}]){
  const f=setup();f.start();f.hover(495);f.frame(0);action(f);const before=f.scroller.scrollTop;f.frame(16);assert.equal(f.scroller.scrollTop,before);assert.equal(f.frames.size,0);
 }
});
test('No drag never scrolls, and a reached boundary releases the animation frame',()=>{
 const f=setup();f.hover(495);assert.equal(f.frames.size,0);f.start();f.scroller.scrollTop=1000;f.hover(495);f.frame(0);assert.equal(f.frames.size,0);assert.equal(f.scroller.scrollTop,1000);
});
