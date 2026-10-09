import test from 'node:test';
import assert from 'node:assert/strict';
import { mockChrome } from './mock-chrome.js';
const mock=mockChrome();globalThis.chrome=mock.chrome;
chrome.tabGroups.get=async id=>({id,windowId:id===3?2:1});
const {closeWindowTabs,closeWindowGroup,closeLiveTab,closeSavedItems}=await import('../src/background/tab-actions.js');
const {serializeState}=await import('../src/background/state-controller.js');
function seed(){mock.tabs.clear();for(const tab of [{id:10,windowId:1,groupId:2},{id:11,windowId:1,groupId:2},{id:12,windowId:1,groupId:-1},{id:20,windowId:2,groupId:3}])mock.tabs.set(tab.id,tab);mock.data.local.arcSidebarModel={favorites:[{id:'fav',type:'tab',url:'https://a.test'}],spaces:[]};mock.data.session.arcSidebarBindings={fav:10,other:20};}
test('Group close reads current full membership, clears live bindings and preserves saved links/other windows',async()=>{
 seed();const original=structuredClone(mock.data.local.arcSidebarModel);mock.tabs.set(13,{id:13,windowId:1,groupId:2});
 assert.deepEqual(await closeWindowGroup(1,2),{count:3});await serializeState(async()=>{});
 assert.deepEqual([...mock.tabs.keys()],[12,20]);assert.deepEqual(mock.data.session.arcSidebarBindings,{other:20});assert.deepEqual(mock.data.local.arcSidebarModel,original);
});
test('Window close includes ungrouped tabs, keeps its window open with a default tab and leaves other windows alone',async()=>{
 seed();assert.deepEqual(await closeWindowTabs(1),{count:3});
 const remaining=[...mock.tabs.values()];assert.equal(remaining.length,2);assert.equal(mock.tabs.has(20),true);
 const replacement=remaining.find(tab=>tab.windowId===1);assert.equal(replacement.active,true);assert.equal(replacement.groupId,-1);assert.equal(replacement.url,undefined);
});
test('Invalid/missing group IDs and another-window group cannot trigger close-all',async()=>{seed();for(const id of [undefined,null,-1,'2',3])await assert.rejects(closeWindowGroup(1,id));assert.equal(mock.tabs.size,4);await assert.rejects(closeWindowTabs(undefined));});
test('Partial failures retain failed bindings and report the error',async()=>{seed();const remove=chrome.tabs.remove;chrome.tabs.remove=async id=>{if(id===10)throw Error('Denied');return remove(id);};await assert.rejects(closeWindowGroup(1,2),/Some tabs/);chrome.tabs.remove=remove;assert.equal(mock.tabs.has(10),true);assert.equal(mock.data.session.arcSidebarBindings.fav,10);});
test('last live tab, saved link, folder batch, group and ungrouped close create the default tab before removal',async()=>{
 const actions=[()=>closeLiveTab(10),()=>closeSavedItems(['fav']),()=>closeSavedItems(['fav','second','fav']),()=>closeWindowGroup(1,2),()=>closeWindowTabs(1,-1)];
 for(let i=0;i<actions.length;i++){
  seed();mock.tabs.delete(11);mock.tabs.delete(12);
  if(i===2){mock.tabs.set(11,{id:11,windowId:1,groupId:2});mock.data.session.arcSidebarBindings.second=11;}
  if(i===4)mock.tabs.get(10).groupId=-1;
  const creates=mock.counts().creates,remove=chrome.tabs.remove;
  chrome.tabs.remove=async id=>{
   const tab=mock.tabs.get(id);
   assert.ok([...mock.tabs.values()].some(other=>other.windowId===tab.windowId&&other.id!==id),'replacement must exist before the final removal');
   return remove(id);
  };
  try{await actions[i]();await serializeState(async()=>{});}finally{chrome.tabs.remove=remove;}
  const remaining=[...mock.tabs.values()].filter(tab=>tab.windowId===1);
  assert.equal(remaining.length,1);assert.equal(remaining[0].active,true);assert.equal(remaining[0].url,undefined);assert.equal(mock.counts().creates-creates,1);
  assert.equal(mock.tabs.has(20),true);assert.equal(mock.data.session.arcSidebarBindings.fav,undefined);
 }
});
test('a surviving regular or Chrome-pinned tab avoids creating an unnecessary default tab',async()=>{
 for(const pinned of [false,true]){
  seed();mock.tabs.get(12).pinned=pinned;
  const creates=mock.counts().creates;await closeWindowGroup(1,2);
  assert.equal(mock.counts().creates,creates);assert.equal(mock.tabs.has(12),true);
 }
});
test('failure to create the replacement aborts closing and preserves saved bindings',async()=>{
 for(const close of [()=>closeWindowTabs(1),()=>closeSavedItems(['fav','second']),()=>closeLiveTab(10)]){
  seed();mock.tabs.delete(12);mock.tabs.delete(11);mock.data.session.arcSidebarBindings.second=11;
  const create=chrome.tabs.create,original=structuredClone(mock.data.session.arcSidebarBindings);
  chrome.tabs.create=async()=>{throw Error('Cannot create default tab');};
  try{await assert.rejects(close(),/Cannot create default tab/);}finally{chrome.tabs.create=create;}
  assert.equal(mock.tabs.has(10),true);assert.deepEqual(mock.data.session.arcSidebarBindings,original);
 }
});
test('repeated and queued close-all operations keep exactly one default tab',async()=>{
 seed();await Promise.all([closeWindowTabs(1),closeWindowTabs(1)]);
 assert.equal([...mock.tabs.values()].filter(tab=>tab.windowId===1).length,1);assert.equal(mock.tabs.has(20),true);
});
test('Chrome pinned tabs survive individual, saved, group, Space and window closes and cannot activate',async()=>{
 seed();mock.tabs.get(10).pinned=true;
 mock.data.local.arcSidebarModel.spaces=[{id:'s',title:'Work',children:[{id:'fav',type:'tab',url:'https://a.test'}]}];
 const {closeLiveTab,closeSavedItems,closeSpaceTabs,activateTab,openSavedItem}=await import('../src/background/tab-actions.js');
 await assert.rejects(closeLiveTab(10),/read-only/);await assert.rejects(activateTab(10),/read-only/);await assert.rejects(openSavedItem('fav',1),/read-only/);
 await closeSavedItems(['fav']);assert.equal(mock.tabs.has(10),true);assert.equal(mock.data.session.arcSidebarBindings.fav,10);
 await closeWindowGroup(1,2);await closeSpaceTabs('s');await closeWindowTabs(1);
 assert.equal(mock.tabs.has(10),true);assert.equal(mock.data.session.arcSidebarBindings.fav,10);
});
