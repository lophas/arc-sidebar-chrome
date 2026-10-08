import test from 'node:test';
import assert from 'node:assert/strict';
import { mockChrome } from './mock-chrome.js';
const mock=mockChrome();globalThis.chrome=mock.chrome;
chrome.tabGroups.get=async id=>({id,windowId:id===3?2:1});
const {closeWindowTabs,closeWindowGroup}=await import('../src/background/tab-actions.js');
const {serializeState}=await import('../src/background/state-controller.js');
function seed(){mock.tabs.clear();for(const tab of [{id:10,windowId:1,groupId:2},{id:11,windowId:1,groupId:2},{id:12,windowId:1,groupId:-1},{id:20,windowId:2,groupId:3}])mock.tabs.set(tab.id,tab);mock.data.local.arcSidebarModel={favorites:[{id:'fav',type:'tab',url:'https://a.test'}],spaces:[]};mock.data.session.arcSidebarBindings={fav:10,other:20};}
test('Group close reads current full membership, clears live bindings and preserves saved links/other windows',async()=>{
 seed();const original=structuredClone(mock.data.local.arcSidebarModel);mock.tabs.set(13,{id:13,windowId:1,groupId:2});
 assert.deepEqual(await closeWindowGroup(1,2),{count:3});await serializeState(async()=>{});
 assert.deepEqual([...mock.tabs.keys()],[12,20]);assert.deepEqual(mock.data.session.arcSidebarBindings,{other:20});assert.deepEqual(mock.data.local.arcSidebarModel,original);
});
test('Window close includes ungrouped tabs and only affects the requested window',async()=>{seed();assert.deepEqual(await closeWindowTabs(1),{count:3});assert.deepEqual([...mock.tabs.keys()],[20]);});
test('Invalid/missing group IDs and another-window group cannot trigger close-all',async()=>{seed();for(const id of [undefined,null,-1,'2',3])await assert.rejects(closeWindowGroup(1,id));assert.equal(mock.tabs.size,4);await assert.rejects(closeWindowTabs(undefined));});
test('Partial failures retain failed bindings and report the error',async()=>{seed();const remove=chrome.tabs.remove;chrome.tabs.remove=async id=>{if(id===10)throw Error('Denied');return remove(id);};await assert.rejects(closeWindowGroup(1,2),/Some tabs/);chrome.tabs.remove=remove;assert.equal(mock.tabs.has(10),true);assert.equal(mock.data.session.arcSidebarBindings.fav,10);});
