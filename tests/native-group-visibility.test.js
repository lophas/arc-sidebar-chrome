import test from 'node:test';
import assert from 'node:assert/strict';
import { syncNativeGroupVisibility } from '../src/background/native-group-visibility.js';
function fixture() {
  const groups = new Map([
    [1,{id:1,windowId:10,title:'Favorites',collapsed:true}],
    [2,{id:2,windowId:10,title:'Work',collapsed:false}],
    [3,{id:3,windowId:10,title:'Other',collapsed:false}],
    [4,{id:4,windowId:20,title:'Work',collapsed:true}],
    [5,{id:5,windowId:20,title:'Favorites',collapsed:false}],
    [6,{id:6,windowId:10,title:'Unrelated',collapsed:false}]
  ]);
  const active = new Map([[10,1],[20,4]]);
  const map={'10:__favorites__':1,'10:w':2,'10:o':3,'20:w':4,'20:__favorites__':5};
  const updates=[];
  globalThis.chrome={storage:{local:{async get(){return {arcSidebarModel:{spaces:[{id:'w',title:'Work'},{id:'o',title:'Other'}]}};}},session:{async get(){return {arcSidebarNativeGroups:map};}}},tabs:{async query({windowId}){return [...active].filter(([id])=>windowId==null||windowId===id).map(([id,groupId])=>({windowId:id,groupId}));}},tabGroups:{async query(){return [...groups.values()];},async get(id){return groups.get(id);},async update(id,changes){Object.assign(groups.get(id),changes);updates.push([id,changes.collapsed]);}}};
  return {groups,active,map,updates};
}
test('each window expands its active group and collapses other managed groups without touching unrelated groups',async()=>{
 const f=fixture();await syncNativeGroupVisibility();
 assert.deepEqual([...f.groups.values()].map(g=>g.collapsed),[false,true,true,false,true,false]);
 const count=f.updates.length;await syncNativeGroupVisibility();assert.equal(f.updates.length,count);
 f.active.set(10,3);await syncNativeGroupVisibility();
 assert.equal(f.groups.get(1).collapsed,true);assert.equal(f.groups.get(3).collapsed,false);
 assert.equal(f.groups.get(4).collapsed,false);
});
test('ungrouped active tabs collapse all managed groups; stale mappings are ignored',async()=>{
 const f=fixture();f.active.set(10,-1);f.map['10:o']=6;
 await syncNativeGroupVisibility();
 assert.equal(f.groups.get(2).collapsed,true);assert.equal(f.groups.get(6).collapsed,false);
 assert.equal(f.groups.get(3).collapsed,false);
});
test('rapid activation changes are read again before collapsing a group',async()=>{
 const f=fixture();const original=chrome.tabGroups.update;
 chrome.tabGroups.update=async(id,changes)=>{await original(id,changes);if(id===1)f.active.set(10,2);};
 await syncNativeGroupVisibility();
 assert.equal(f.groups.get(2).collapsed,false);
});
