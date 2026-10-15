import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { EDGE_TRIGGER_KEY, edgeTrigger, isEdgeTrigger } from '../src/shared/edge-trigger.js';
function fixture({local,cloud,enabled=true}={}){
 const data={local:local?{[EDGE_TRIGGER_KEY]:local}:{},sync:{arcSidebarSyncEnabled:enabled,...(cloud?{arcSidebarSyncedEdgeTrigger:cloud}:{})}};
 const events={startup:[],installed:[]},listeners=[],writes=[],timers=new Map();let timerId=0;
 const area=name=>({async get(key){return structuredClone(Object.fromEntries((Array.isArray(key)?key:[key]).filter(k=>k in data[name]).map(k=>[k,data[name][k]])));},async set(values){const changes={};for(const [key,value]of Object.entries(values)){if(JSON.stringify(data[name][key])===JSON.stringify(value))continue;changes[key]={oldValue:data[name][key],newValue:value};data[name][key]=structuredClone(value);}writes.push({area:name,values:structuredClone(values)});if(Object.keys(changes).length)listeners.forEach(fn=>fn(changes,name));}});
 const chrome={storage:{local:area('local'),sync:area('sync'),onChanged:{addListener:fn=>listeners.push(fn)}},runtime:{onStartup:{addListener:fn=>events.startup.push(fn)},onInstalled:{addListener:fn=>events.installed.push(fn)}}};
 const context=vm.createContext({chrome,EDGE_TRIGGER_KEY,edgeTrigger,isEdgeTrigger,createStorageClient:()=>chrome.storage,commitStorage(){},console,setTimeout:fn=>{timers.set(++timerId,fn);return timerId;},clearTimeout:id=>timers.delete(id)});
 vm.runInContext(fs.readFileSync('src/background/trigger-sync.js','utf8').replace(/^import .*;\n/gm,'').replace(/export /g,''),context);
 const drain=async()=>{for(let i=0;i<10;i++){const pending=[...timers.values()];timers.clear();pending.forEach(fn=>fn());await vm.runInContext('tail',context);}};
 return {data,chrome,writes,drain,start:async()=>{events.startup.forEach(fn=>fn());await drain();}};
}
test('trigger Sync pulls cloud first on fresh/reset profiles and never uploads implicit defaults',async()=>{
 const cloud={height:25,offset:60,width:12};
 for(const local of [undefined,{height:100,offset:0,width:16}]){
  const f=fixture({local,cloud});await f.start();assert.deepEqual(f.data.local[EDGE_TRIGGER_KEY],cloud);assert.equal(f.writes.filter(w=>w.area==='sync').length,0);
 }
 const f=fixture();await f.start();assert.equal(f.writes.length,0);
});
test('trigger edits round trip through Sync without echo loops, including differently ordered objects',async()=>{
 const f=fixture();await f.chrome.storage.local.set({[EDGE_TRIGGER_KEY]:{width:22,offset:30,height:50}});await f.drain();
 assert.deepEqual(f.data.sync.arcSidebarSyncedEdgeTrigger,{height:50,offset:30,width:22});
 assert.equal(f.writes.filter(w=>w.area==='sync').length,1);
 const remote={height:20,offset:80,width:10};await f.chrome.storage.sync.set({arcSidebarSyncedEdgeTrigger:remote});await f.drain();assert.deepEqual(f.data.local[EDGE_TRIGGER_KEY],remote);
 assert.equal(f.writes.filter(w=>w.area==='sync').length,2);
});
test('disabled Sync keeps settings local and enabling restores existing cloud settings',async()=>{
 const cloud={height:30,offset:40,width:11},f=fixture({cloud,enabled:false});
 await f.chrome.storage.local.set({[EDGE_TRIGGER_KEY]:{height:100,offset:0,width:16}});await f.drain();assert.deepEqual(f.data.sync.arcSidebarSyncedEdgeTrigger,cloud);
 await f.chrome.storage.sync.set({arcSidebarSyncEnabled:true});await f.drain();assert.deepEqual(f.data.local[EDGE_TRIGGER_KEY],cloud);
});
test('invalid cloud values cannot override local geometry and local reset cannot erase cloud settings',async()=>{
 const local={height:50,offset:30,width:22},f=fixture({local,cloud:{height:0,offset:0,width:3}});await f.start();assert.deepEqual(f.data.local[EDGE_TRIGGER_KEY],local);
 const before=structuredClone(f.data.sync);delete f.data.local[EDGE_TRIGGER_KEY];await f.start();assert.deepEqual(f.data.sync,before);
});
