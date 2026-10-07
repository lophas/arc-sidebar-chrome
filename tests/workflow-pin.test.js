import test from 'node:test';
import assert from 'node:assert/strict';
import { mockChrome } from './mock-chrome.js';
const mock=mockChrome();globalThis.chrome=mock.chrome;
mock.chrome.tabGroups.get=async id=>({id,windowId:1,title:'Work'});
const { pinWorkflowTab }=await import('../src/background/tab-actions.js');
const seed=()=>{
 mock.tabs.clear();
 for(const tab of [{id:10,windowId:1,groupId:2,url:'https://a.test',title:'A'},{id:11,windowId:1,groupId:2,url:'https://work.test',title:'Workflow'}])mock.tabs.set(tab.id,tab);
 mock.data.local.arcSidebarModel={favorites:[],spaces:[{id:'s',title:'Work',children:[{id:'a',type:'tab',title:'A',url:'https://a.test'},{id:'f',type:'folder',children:[{id:'b',type:'tab',url:'https://b.test'}]}]}]};
 mock.data.session.arcSidebarBindings={a:10};mock.data.session.arcSidebarNativeGroups={'1:s':2};
};
test('drag pin inserts at the chosen root position and reuses the existing live tab',async()=>{
 seed();const creates=mock.counts().creates;const id=await pinWorkflowTab({tabId:11,spaceId:'s',targetNodeId:'a',after:false});
 assert.deepEqual(mock.data.local.arcSidebarModel.spaces[0].children.map(n=>n.id),[id,'a','f']);
 assert.equal(mock.data.session.arcSidebarBindings[id],11);assert.equal(mock.counts().creates,creates);assert.equal(mock.tabs.size,2);assert.equal(mock.data.local.arcSidebarModel.stats.tabs,3);
});
test('drag pin supports folder insertion between items, folder append and empty root',async()=>{
 seed();let id=await pinWorkflowTab({tabId:11,spaceId:'s',targetNodeId:'b',after:true});
 assert.deepEqual(mock.data.local.arcSidebarModel.spaces[0].children[1].children.map(n=>n.id),['b',id]);
 seed();id=await pinWorkflowTab({tabId:11,spaceId:'s',folderId:'f'});assert.equal(mock.data.local.arcSidebarModel.spaces[0].children[1].children[1].id,id);
 seed();mock.data.local.arcSidebarModel.spaces[0].children=[];mock.data.session.arcSidebarBindings={};id=await pinWorkflowTab({tabId:11,spaceId:'s'});assert.equal(mock.data.local.arcSidebarModel.spaces[0].children[0].id,id);
});
test('simultaneous pin requests are idempotent and preserve existing metadata',async()=>{
 seed();mock.data.local.arcSidebarModel.spaces[0].children[0].customIcon='data:image/png;base64,icon';
 const ids=await Promise.all([pinWorkflowTab({tabId:11,spaceId:'s'}),pinWorkflowTab({tabId:11,spaceId:'s'})]);
 assert.equal(ids[0],ids[1]);assert.equal(mock.data.local.arcSidebarModel.spaces[0].children.length,3);assert.equal(mock.data.local.arcSidebarModel.spaces[0].children[0].customIcon,'data:image/png;base64,icon');
});
test('closed/moved tabs and deleted drop targets fail without partial writes',async()=>{
 for(const kind of ['closed','moved','target','folder']){
  seed();if(kind==='closed')mock.tabs.delete(11);if(kind==='moved')mock.tabs.get(11).groupId=9;
  const before=structuredClone(mock.data);
  const position=kind==='target'?{targetNodeId:'deleted'}:kind==='folder'?{folderId:'deleted'}:{};
  await assert.rejects(pinWorkflowTab({tabId:11,spaceId:'s',...position}));assert.deepEqual(mock.data,before);
 }
});
test('unsupported page URLs cannot create a saved item',async()=>{
 seed();mock.tabs.get(11).url='chrome-extension://other/page';const before=structuredClone(mock.data);
 await assert.rejects(pinWorkflowTab({tabId:11,spaceId:'s'}),/cannot be saved/);assert.deepEqual(mock.data,before);
});
