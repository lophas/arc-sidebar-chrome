import test from 'node:test';
import assert from 'node:assert/strict';
import { spaceWorkflowTabs } from '../src/shared/space-tabs.js';
const model = {favorites:[{id:'fav',type:'tab'}],spaces:[
 {id:'work',title:'Work',children:[{id:'f',type:'folder',children:[{id:'a',type:'tab'}]}]},
 {id:'other',title:'Other',children:[{id:'b',type:'tab'}]}]};
const space=model.spaces[0], bindings={a:1,b:4,fav:5};
const groups=[{id:10,windowId:1,title:'Work'},{id:20,windowId:2,title:'Work'},{id:30,windowId:1,title:'Other'}];
const groupMap={'1:work':10,'2:work':20,'1:other':30};
const tabs=[{id:1,groupId:10,windowId:1,index:0},{id:2,groupId:10,windowId:1,index:3,url:'https://same.test'},
 {id:3,groupId:10,windowId:1,index:1,url:'https://same.test'}, {id:4,groupId:10,windowId:1,index:2},
 {id:5,groupId:10,windowId:1,index:4},{id:6,groupId:20,windowId:2,index:0},
 {id:7,groupId:30,windowId:1,index:5},{id:8,groupId:-1,windowId:1,index:6}];
const select=()=>spaceWorkflowTabs(model,space,bindings,tabs,groupMap,groups,1);
test('Space workflow rows exclude all saved bindings and retain distinct same-URL tabs in browser order',()=>{
 assert.deepEqual(select().map(t=>t.id),[3,2,6]);
});
test('workflow-only groups remain visible without a live pinned tab',()=>{
 assert.deepEqual(spaceWorkflowTabs(model,space,{},tabs.filter(t=>![1,4,5].includes(t.id)),groupMap,groups,1).map(t=>t.id),[3,2,6]);
});
test('reassigned/missing maps are ignored and another current window is prioritized',()=>{
 const renamed=groups.map(g=>g.id===20?{...g,title:'Unrelated'}:g);
 assert.deepEqual(spaceWorkflowTabs(model,space,bindings,tabs,groupMap,renamed,1).map(t=>t.id),[3,2]);
 assert.deepEqual(spaceWorkflowTabs(model,space,bindings,tabs,groupMap,groups,2).map(t=>t.id),[6,3,2]);
});
test('live group changes move workflow rows immediately and pinning removes only the bound instance',()=>{
 const moved=tabs.map(t=>t.id===2?{...t,groupId:30}:t);
 assert.deepEqual(spaceWorkflowTabs(model,space,bindings,moved,groupMap,groups,1).map(t=>t.id),[3,6]);
 const pinned=structuredClone(model);pinned.spaces[0].children.push({id:'new',type:'tab'});
 assert.deepEqual(spaceWorkflowTabs(pinned,pinned.spaces[0],{...bindings,new:2},tabs,groupMap,groups,1).map(t=>t.id),[3,6]);
});
