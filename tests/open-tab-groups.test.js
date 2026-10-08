import test from 'node:test';
import assert from 'node:assert/strict';
import { groupOpenTabs } from '../src/shared/open-tab-groups.js';
test('Open-tabs sections follow browser order, keep duplicate names distinct and gather ungrouped tabs',()=>{
 const tabs=[{id:4,index:4,groupId:2},{id:3,index:3,groupId:-1},{id:1,index:0,groupId:5},{id:2,index:1,groupId:5},{id:5,index:2,groupId:-1}];
 const sections=groupOpenTabs(tabs,[{id:2,title:'Work',color:'blue'},{id:5,title:'Work',color:'red'}]);
 assert.deepEqual(sections.map(s=>[s.id,s.title,s.tabs.map(t=>t.id)]),[[5,'Work',[1,2]],[-1,'Ungrouped',[5,3]],[2,'Work',[4]]]);
 assert.deepEqual(tabs.map(t=>t.id),[4,3,1,2,5]);
 assert.equal(groupOpenTabs([{id:1,index:0,groupId:99}],[])[0].title,'Unnamed group');
});
