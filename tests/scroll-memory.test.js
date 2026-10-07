import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import vm from 'node:vm';
async function setup() {
 const events={window:{},scroll:null,storage:null},writes=[],frames=[],timers=new Map();let sequence=0,active=true;
 const data={arcSidebarState:{currentSpaceId:'one'},arcSidebarScrollPositions:{one:120,two:250}};
 const storage={local:{get:async()=>structuredClone(data),patch:async(key,values)=>{writes.push(values);data[key]={...data[key],...values};}}};
 const scroller={scrollTop:0,addEventListener:(_,fn)=>events.scroll=fn};
 const context={sidebarStorage:storage,createStorageClient:()=>storage,isSidebarActive:()=>active,document:{querySelector:()=>scroller},window:{addEventListener:(type,fn)=>(events.window[type]||=[]).push(fn)},chrome:{storage:{onChanged:{addListener:fn=>events.storage=fn}}},requestAnimationFrame:fn=>{frames.push(fn);return frames.length;},cancelAnimationFrame(){},setTimeout:fn=>{timers.set(++sequence,fn);return sequence;},clearTimeout:id=>timers.delete(id),console};
 vm.createContext(context);vm.runInContext(fs.readFileSync('src/sidepanel/scroll-memory.js','utf8').replace(/^import .*\n/gm,'').replace('const sidebarStorage = createStorageClient({ isActive: isSidebarActive });',''),context);await Promise.resolve();await Promise.resolve();
 const frame=()=>{const queued=frames.splice(0);queued.forEach(fn=>fn());};
 const emit=(type,event)=>events.window[type]?.forEach(fn=>fn(event));
 return {events,writes,scroller,frame,emit,setActive:value=>{active=value;},tick:async()=>{const queued=[...timers.values()];timers.clear();queued.forEach(fn=>fn());await Promise.resolve();}};
}
test('restoration/re-render scroll events do not write state',async()=>{const s=await setup();s.frame();assert.equal(s.scroller.scrollTop,120);s.events.scroll();s.frame();await s.tick();assert.equal(s.writes.length,0);s.emit('arc-sidebar-rendered');s.frame();s.events.scroll();s.frame();await s.tick();assert.equal(s.writes.length,0);});
test('user scroll writes only the captured Space, even during a Space switch',async()=>{const s=await setup();s.frame();s.frame();s.scroller.scrollTop=400;s.events.scroll();s.events.storage({arcSidebarState:{newValue:{currentSpaceId:'two'}}},'local');await Promise.resolve();assert.equal(s.writes.length,1);assert.equal(s.writes[0].one,400);assert.equal(s.writes[0].two,undefined);});
test('hidden views never generate new scroll writes',async()=>{const s=await setup();s.frame();s.frame();s.setActive(false);s.scroller.scrollTop=999;s.events.scroll();s.emit('arc-sidebar-activity',{detail:{active:false}});await s.tick();assert.equal(s.writes.length,0);});
