import test from 'node:test';
import assert from 'node:assert/strict';
import { mockChrome } from './mock-chrome.js';
import { createStorageClient } from '../src/shared/storage-client.js';
const mock=mockChrome();globalThis.chrome=mock.chrome;
const {commitStorage,serializeState}=await import('../src/background/state-controller.js');
const {openSavedItem,activateTab,closeSavedItems}=await import('../src/background/tab-actions.js');
const seed=()=>({spaces:[{id:'s',children:[{id:'f',type:'folder',children:[{id:'a',type:'tab',title:'A',url:'https://a.test'}]}]}],favorites:[]});
test('several clients merge independent UI changes on one queue',async()=>{
mock.data.local.arcSidebarState={currentSpaceId:'s',collapsedFolders:{existing:true}};
const a=createStorageClient({transact:commitStorage}),b=createStorageClient({transact:commitStorage});
await Promise.all([a.local.patch('arcSidebarState',{currentSpaceId:'other'}),b.local.patch('arcSidebarState',{collapsedFolders:{f:false}})]);
assert.deepEqual(mock.data.local.arcSidebarState,{currentSpaceId:'other',collapsedFolders:{existing:true,f:false}});});
test('scroll writers only alter their own Space',async()=>{
const clients=Array.from({length:8},()=>createStorageClient({transact:commitStorage}));await Promise.all(clients.map((c,i)=>c.local.patch('arcSidebarScrollPositions',{['s'+i]:i*10})));assert.equal(Object.keys(mock.data.local.arcSidebarScrollPositions).length,8);});
test('two stale editor models merge different fields',async()=>{
mock.data.local.arcSidebarModel=seed();const a=createStorageClient({transact:commitStorage}),b=createStorageClient({transact:commitStorage});
const av=(await a.local.get('arcSidebarModel')).arcSidebarModel,bv=(await b.local.get('arcSidebarModel')).arcSidebarModel;
av.spaces[0].title='Space';bv.spaces[0].children[0].title='Folder';await Promise.all([a.local.set({arcSidebarModel:av}),b.local.set({arcSidebarModel:bv})]);assert.equal(mock.data.local.arcSidebarModel.spaces[0].title,'Space');assert.equal(mock.data.local.arcSidebarModel.spaces[0].children[0].title,'Folder');});
test('conflicting multi-key batch writes nothing and queue keeps working',async()=>{
mock.data.local.arcSidebarModel=seed();const client=createStorageClient({transact:commitStorage});const stale=(await client.local.get('arcSidebarModel')).arcSidebarModel;
stale.spaces[0].children[0].children[0].title='stale';mock.data.local.arcSidebarModel.spaces[0].children[0].children[0].title='latest';
await assert.rejects(client.local.set({arcSidebarModel:stale,arcSidebarState:{currentSpaceId:'bad'}}),/changed elsewhere/);assert.notEqual(mock.data.local.arcSidebarState?.currentSpaceId,'bad');await client.local.patch('arcSidebarState',{currentSpaceId:'good'});assert.equal(mock.data.local.arcSidebarState.currentSpaceId,'good');});
test('rapid duplicate opens create one tab and reveal its Space',async()=>{
mock.data.local.arcSidebarModel=seed();mock.data.session.arcSidebarBindings={};mock.data.local.arcSidebarState={currentSpaceId:'other',collapsedFolders:{f:true}};
const before=mock.counts().creates;const ids=await Promise.all([openSavedItem('a',1),openSavedItem('a',1)]);assert.equal(ids[0],ids[1]);assert.equal(mock.counts().creates-before,1);assert.equal(mock.data.local.arcSidebarState.currentSpaceId,'s');assert.equal(mock.data.local.arcSidebarState.collapsedFolders.f,false);});
test('Open tab activation reveals pinned Space and closure removes binding',async()=>{
const id=mock.data.session.arcSidebarBindings.a;mock.data.local.arcSidebarState.currentSpaceId='other';await activateTab(id);assert.equal(mock.data.local.arcSidebarState.currentSpaceId,'s');await closeSavedItems(['a']);await serializeState(async()=>{});assert.equal(mock.data.session.arcSidebarBindings.a,undefined);assert.equal(mock.tabs.has(id),false);});
test('tab replacement is owned by background even without a sidebar',async()=>{
mock.data.session.arcSidebarBindings={a:10,b:20};mock.emit('replaced',30,10);await serializeState(async()=>{});assert.deepEqual(mock.data.session.arcSidebarBindings,{a:30,b:20});mock.emit('removed',20);await serializeState(async()=>{});assert.deepEqual(mock.data.session.arcSidebarBindings,{a:30});});
test('pinning commits model and binding in one validated batch',async()=>{
mock.data.local.arcSidebarModel=seed();mock.data.session.arcSidebarBindings={};
const client=createStorageClient({transact:commitStorage});const model=(await client.local.get('arcSidebarModel')).arcSidebarModel;const bindings=(await client.session.get('arcSidebarBindings')).arcSidebarBindings;
model.spaces[0].children.push({id:'new',type:'tab',url:'https://new.test'});bindings.new=50;
await client.transaction({local:{arcSidebarModel:model},session:{arcSidebarBindings:bindings}});assert.equal(mock.data.session.arcSidebarBindings.new,50);assert.equal(mock.data.local.arcSidebarModel.stats.tabs,2);});
test('cross-area conflict is checked before either area is changed',async()=>{
const client=createStorageClient({transact:commitStorage});const model=(await client.local.get('arcSidebarModel')).arcSidebarModel;const bindings=(await client.session.get('arcSidebarBindings')).arcSidebarBindings;
model.spaces[0].title='Should not save';bindings.new=51;mock.data.session.arcSidebarBindings.new=52;
await assert.rejects(client.transaction({local:{arcSidebarModel:model},session:{arcSidebarBindings:bindings}}),/changed elsewhere/);assert.notEqual(mock.data.local.arcSidebarModel.spaces[0].title,'Should not save');assert.equal(mock.data.session.arcSidebarBindings.new,52);});
test('removing model items prunes their bindings but leaves browser tabs alone',async()=>{
const client=createStorageClient({transact:commitStorage});const model=(await client.local.get('arcSidebarModel')).arcSidebarModel;model.spaces[0].children.pop();mock.tabs.set(52,{id:52,windowId:1});await client.local.set({arcSidebarModel:model});assert.equal(mock.data.session.arcSidebarBindings.new,undefined);assert.equal(mock.tabs.has(52),true);});
test('snapshot waits for a complete queued model and binding transaction',async()=>{
mock.data.local.arcSidebarModel=seed();mock.data.session.arcSidebarBindings={};
const client=createStorageClient({transact:commitStorage});await client.snapshot({local:['arcSidebarModel'],session:['arcSidebarBindings']});
const model=seed();model.spaces[0].title='Snapshot';
const write=client.transaction({local:{arcSidebarModel:model},session:{arcSidebarBindings:{a:10}}});
const read=client.snapshot({local:['arcSidebarModel'],session:['arcSidebarBindings']});await write;
const result=await read;assert.equal(result.local.arcSidebarModel.spaces[0].title,'Snapshot');assert.deepEqual(result.session.arcSidebarBindings,{a:10});});
