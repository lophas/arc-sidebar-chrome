import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { hasSyncContent } from '../src/shared/sync-content.js';

const initial = () => ({version:2,favorites:[],spaces:[{id:'__my_space__',title:'My Space',emoji:'🚀',children:[]}],stats:{spaces:1,folders:0,tabs:0,favorites:0}});
const content = () => ({...initial(),favorites:[{id:'fav',type:'tab',title:'Mail',url:'https://mail.test'}]});
const source = fs.readFileSync('src/background/service-worker.js','utf8');
function fixture(localModel=initial(), remote=content(), localUpdatedAt=10000, remoteUpdatedAt=1) {
 const data={local:{arcSidebarModel:structuredClone(localModel),arcSidebarModelUpdatedAt:localUpdatedAt},session:{},sync:{arcSidebarSyncEnabled:true}};
 if(remote){data.sync['arcSidebarSyncChunk:0']=Buffer.from(JSON.stringify(remote)).toString('base64');data.sync.arcSidebarSyncMeta={schema:1,chunks:1,updatedAt:remoteUpdatedAt};}
 const writes=[],listeners=[],timers=new Map();let timerId=0;
 const area=name=>({async get(keys){const names=keys==null?Object.keys(data[name]):typeof keys==='string'?[keys]:keys;return structuredClone(Object.fromEntries(names.filter(k=>k in data[name]).map(k=>[k,data[name][k]])));},async set(values){const changes={};for(const [key,value]of Object.entries(values)){if(JSON.stringify(data[name][key])===JSON.stringify(value))continue;changes[key]={oldValue:structuredClone(data[name][key]),newValue:structuredClone(value)};data[name][key]=structuredClone(value);}writes.push({area:name,values:structuredClone(values)});if(Object.keys(changes).length)for(const listener of listeners)listener(changes,name);},async remove(keys){for(const k of Array.isArray(keys)?keys:[keys])delete data[name][k];},async clear(){data[name]={};}});
 const chrome={storage:{local:area('local'),session:area('session'),sync:area('sync'),onChanged:{addListener:fn=>listeners.push(fn)}}};
 const context=vm.createContext({chrome,sidebarStorage:chrome.storage,hasSyncContent,TextEncoder,TextDecoder,btoa,atob,console,Date:{now:()=>20000},setTimeout:fn=>{const id=++timerId;timers.set(id,fn);return id;},clearTimeout:id=>timers.delete(id),queueNativeGroupSync(){},refreshActiveSidebar:async()=>{}});
 vm.runInContext(source.slice(source.indexOf('const STORAGE_KEY'),source.indexOf('async function broadcastNativePanelState')),context);
 vm.runInContext(source.slice(source.indexOf('chrome.storage.onChanged.addListener('),source.indexOf('chrome.tabs.onCreated.addListener(')),context);
 const drain=async()=>{const callbacks=[...timers.values()];timers.clear();for(const fn of callbacks)await fn();};
 const snapshotWrites=()=>writes.filter(w=>w.area==='sync'&&w.values.arcSidebarSyncMeta);
 return {context,data,chrome,writes,drain,snapshotWrites};
}
test('only intentional organization qualifies for uploading, not the generated default',()=>{
 for(const model of [null,undefined,{},initial(),{version:2,favorites:[],spaces:[],stats:{tabs:900}}])assert.equal(hasSyncContent(model),false);
 for(const change of [m=>m.favorites.push({type:'tab',url:'https://a.test'}),m=>m.spaces[0].children.push({type:'folder',title:'Empty folder',children:[]}),m=>m.spaces[0].title='Work',m=>m.spaces[0].emoji='💼',m=>m.spaces.push({id:'new',title:'New',children:[]})]){const model=initial();change(model);assert.equal(hasSyncContent(model),true);}
});
test('fresh install and reset defaults pull the cloud snapshot despite a newer local timestamp',async()=>{
 for(const model of [undefined,initial()]){
  const f=fixture(model);const cloud=structuredClone(f.data.sync);
  const result=await f.context.reconcileSidebarSync();
  assert.equal(result.direction,'pull');assert.deepEqual(f.data.local.arcSidebarModel,content());
  await f.drain();assert.equal(f.snapshotWrites().length,0);assert.deepEqual(f.data.sync,cloud);
 }
});
test('enabling Sync and Sync now concurrently never upload the empty starting configuration',async()=>{
 const f=fixture();f.data.sync.arcSidebarSyncEnabled=false;
 await f.chrome.storage.sync.set({arcSidebarSyncEnabled:true});
 await Promise.all([f.context.reconcileSidebarSync(),f.context.reconcileSidebarSync()]);await f.drain();
 assert.deepEqual(f.data.local.arcSidebarModel,content());assert.equal(f.snapshotWrites().length,0);
});
test('empty local data never overwrites absent, empty or partially arriving cloud data',async()=>{
 for(const remote of [null,initial()]){
  const f=fixture(initial(),remote);const before=structuredClone(f.data.sync);
  assert.equal((await f.context.reconcileSidebarSync()).reason,'empty-local-model');
  await f.context.writeSyncedModel(initial());f.context.queueModelSyncPush();await f.drain();
  assert.equal(f.snapshotWrites().length,0);assert.deepEqual(f.data.sync,before);
 }
 const f=fixture();const chunk=f.data.sync['arcSidebarSyncChunk:0'];delete f.data.sync['arcSidebarSyncChunk:0'];
 assert.equal((await f.context.reconcileSidebarSync()).reason,'empty-local-model');
 await f.chrome.storage.sync.set({'arcSidebarSyncChunk:0':chunk});await f.drain();
 assert.deepEqual(f.data.local.arcSidebarModel,content());assert.equal(f.snapshotWrites().length,0);
});
test('intentional local content starts uploading; newer valid remote content still wins',async()=>{
 const f=fixture(content(),null);assert.equal((await f.context.reconcileSidebarSync()).direction,'push');assert.equal(f.snapshotWrites().length,1);
 const expected=content();expected.spaces[0].title='Remote work';
 const remote=fixture(content(),expected,1,500);assert.equal((await remote.context.reconcileSidebarSync()).direction,'pull');assert.deepEqual(remote.data.local.arcSidebarModel,expected);assert.equal(remote.snapshotWrites().length,0);
 const oldEmpty=fixture(content(),initial(),1,500);assert.equal((await oldEmpty.context.reconcileSidebarSync()).direction,'push');
});
test('a queued push uses fresh local data and cannot overwrite cloud after a reset',async()=>{
 const f=fixture(content());const cloud=structuredClone(f.data.sync);f.context.queueModelSyncPush();
 f.data.local.arcSidebarModel=initial();await f.drain();
 assert.equal(f.snapshotWrites().length,0);assert.deepEqual(f.data.sync,cloud);assert.deepEqual(f.data.local.arcSidebarModel,initial());
});
test('disabling Sync while a cloud read is in flight cancels the pending restore',async()=>{
 const f=fixture();let release,started;
 const gate=new Promise(done=>release=done),reading=new Promise(done=>started=done),get=f.chrome.storage.sync.get;
 f.chrome.storage.sync.get=async keys=>{if(keys===null){started();await gate;}return get(keys);};
 const run=f.context.reconcileSidebarSync();await reading;
 await f.chrome.storage.sync.set({arcSidebarSyncEnabled:false});release();
 assert.equal((await run).reason,'disabled');assert.deepEqual(f.data.local.arcSidebarModel,initial());assert.equal(f.snapshotWrites().length,0);
});
test('Options reset keeps cloud data, clears local/session data, and can restore after re-enabling',async()=>{
 const f=fixture(content());f.data.session.arcSidebarBindings={fav:10};const before=structuredClone(f.data.sync);
 Object.assign(f.context,{window:{confirm:()=>true},resetAll:{disabled:false},status:{textContent:''},backupStatus:{textContent:''},render(){},renderSyncStatus:async()=>{}});
 const options=fs.readFileSync('src/options/index.js','utf8');
 vm.runInContext(options.slice(options.indexOf('async function resetExtensionData('),options.indexOf("arcFile.addEventListener('change'")),f.context);
 await f.context.resetExtensionData();
 assert.deepEqual(f.data.sync,{...before,arcSidebarSyncEnabled:false});assert.deepEqual(f.data.local,{});assert.deepEqual(f.data.session,{});
 f.data.local.arcSidebarModel=initial();f.data.local.arcSidebarModelUpdatedAt=999999;
 await f.chrome.storage.sync.set({arcSidebarSyncEnabled:true});await f.context.reconcileSidebarSync();await f.drain();
 assert.deepEqual(f.data.local.arcSidebarModel,content());assert.equal(f.snapshotWrites().length,0);
});
