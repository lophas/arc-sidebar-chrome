import test from 'node:test';
import assert from 'node:assert/strict';
import { mockChrome } from './mock-chrome.js';
const mock = mockChrome(); globalThis.chrome = mock.chrome;
const groups = new Map();
mock.chrome.tabGroups.get = async id => { if (!groups.has(id)) throw Error('No group'); return groups.get(id); };
const { closeSpaceTabs, getSpaceCloseInfo } = await import('../src/background/tab-actions.js');
const { serializeState } = await import('../src/background/state-controller.js');
const { pruneGroupMap } = await import('../src/background/native-group-map.js');
const seed = () => {
 mock.tabs.clear(); groups.clear();
 mock.data.local.arcSidebarModel = { favorites: [{id:'fav',type:'tab',url:'https://fav.test'}], spaces:[
  {id:'s',title:'Work',children:[{id:'folder',type:'folder',children:[{id:'a',type:'tab',url:'https://a.test'}]}]},
  {id:'other',title:'Other',children:[{id:'b',type:'tab',url:'https://b.test'}]}] };
 mock.data.session.arcSidebarBindings={a:10,b:20,fav:30};
 mock.data.session.arcSidebarNativeGroups={'1:s':2,'2:s':3,'1:other':4};
 groups.set(2,{id:2,windowId:1,title:'Work'});groups.set(3,{id:3,windowId:2,title:'Work'});groups.set(4,{id:4,windowId:1,title:'Other'});
 for(const tab of [{id:10,windowId:1,groupId:2},{id:11,windowId:1,groupId:2},{id:12,windowId:2,groupId:3},{id:20,windowId:1,groupId:4},{id:30,windowId:1,groupId:5},{id:40,windowId:1,groupId:-1}]) mock.tabs.set(tab.id,tab);
};
test('Space close includes workflow tabs across its groups/windows and preserves saved items',async()=>{
 seed(); const original=structuredClone(mock.data.local.arcSidebarModel);
 assert.deepEqual(await getSpaceCloseInfo('s'),{count:3,groupCount:2});
 await closeSpaceTabs('s'); await serializeState(async()=>{});
 const remaining=[...mock.tabs.values()];assert.deepEqual(remaining.filter(tab=>tab.windowId===1).map(tab=>tab.id),[20,30,40]);
 const replacement=remaining.filter(tab=>tab.windowId===2);assert.equal(replacement.length,1);assert.equal(replacement[0].url,undefined);assert.equal(replacement[0].active,true);
 assert.deepEqual(mock.data.session.arcSidebarBindings,{b:20,fav:30});assert.deepEqual(mock.data.local.arcSidebarModel,original);
});
test('workflow-only mapped groups can close after every pinned tab has closed',async()=>{
 seed();mock.tabs.delete(10);delete mock.data.session.arcSidebarBindings.a;
 assert.equal(await pruneGroupMap(mock.data.session.arcSidebarNativeGroups,new Set(['1:other']),mock.data.local.arcSidebarModel),false);
 assert.equal((await getSpaceCloseInfo('s')).count,2);await closeSpaceTabs('s');assert.equal(mock.tabs.has(11),false);assert.equal(mock.tabs.has(12),false);
});
test('membership is refreshed at click time and ungrouped Space bindings still close',async()=>{
 seed();await getSpaceCloseInfo('s');mock.tabs.set(13,{id:13,windowId:1,groupId:2});mock.tabs.get(11).groupId=4;mock.tabs.get(10).groupId=-1;
 await closeSpaceTabs('s');assert.equal(mock.tabs.has(13),false);assert.equal(mock.tabs.has(11),true);assert.equal(mock.tabs.has(10),false);
});
test('stale/reassigned group mappings never close an unrelated group',async()=>{
 seed();mock.tabs.delete(10);delete mock.data.session.arcSidebarBindings.a;groups.get(2).title='Unrelated';groups.delete(3);
 assert.equal((await getSpaceCloseInfo('s')).count,0);
 await closeSpaceTabs('s');assert.equal(mock.tabs.has(11),true);assert.equal(mock.tabs.has(12),true);
 assert.equal(await pruneGroupMap(mock.data.session.arcSidebarNativeGroups,new Set(['1:other']),mock.data.local.arcSidebarModel),true);
 assert.deepEqual(mock.data.session.arcSidebarNativeGroups,{'1:other':4});
});
test('a deleted Space cannot close any tabs',async()=>{
 seed();mock.data.local.arcSidebarModel.spaces.shift();await assert.rejects(closeSpaceTabs('s'),/no longer exists/);assert.equal(mock.tabs.size,6);
});
test('failed tab closures keep their bindings and report the partial failure',async()=>{
 seed();const remove=mock.chrome.tabs.remove;mock.chrome.tabs.remove=async id=>{if(id===10)throw Error('Busy');return remove(id);};
 try {await assert.rejects(closeSpaceTabs('s'),/Some tabs/);assert.equal(mock.tabs.has(10),true);assert.equal(mock.data.session.arcSidebarBindings.a,10);assert.equal(mock.tabs.has(11),false);} finally {mock.chrome.tabs.remove=remove;}
});
test('closing a Space that empties several windows leaves one default tab in each',async()=>{
 seed();for(const id of [20,30,40])mock.tabs.delete(id);
 const creates=mock.counts().creates;await closeSpaceTabs('s');await serializeState(async()=>{});
 const remaining=[...mock.tabs.values()];assert.equal(remaining.length,2);assert.equal(mock.counts().creates-creates,2);
 for(const windowId of [1,2]){const tabs=remaining.filter(tab=>tab.windowId===windowId);assert.equal(tabs.length,1);assert.equal(tabs[0].url,undefined);assert.equal(tabs[0].active,true);}
 assert.equal(mock.data.session.arcSidebarBindings.a,undefined);
});
