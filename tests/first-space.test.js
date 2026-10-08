import test from 'node:test';
import assert from 'node:assert/strict';
import {prepareFirstSpace} from '../src/shared/first-space.js';
test('first link/folder drafts create and select My Space while preserving Favorites',()=>{
 for(const type of ['tab','folder']){
  const stored={version:2,spaces:[],favorites:[{id:'f',type:'tab'}]};
  const state={currentSpaceId:'__open_tabs__',collapsedFolders:{}};
  const draft=structuredClone(stored);
  const result=prepareFirstSpace(draft,state);
  assert.equal(result.created,true);
  assert.equal(stored.spaces.length,0,'draft/cancel cannot alter stored state');
  assert.equal(result.model.spaces[0].title,'My Space');
  assert.equal(result.model.spaces[0].emoji,'🚀');
  assert.equal(state.currentSpaceId,result.model.spaces[0].id);
  result.model.spaces[0].children.push({type,id:'item'});
  assert.deepEqual(result.model.favorites,stored.favorites);
  assert.equal(prepareFirstSpace(result.model,state).created,false);
 }
});
test('fresh/reset and empty imports can add an item; populated imports keep their Spaces',()=>{
 const state={};const fresh=prepareFirstSpace(undefined,state);
 assert.equal(fresh.model.spaces.length,1);
 const model={spaces:[{id:'imported',title:'Work',children:[]}],favorites:[]};
 const current={currentSpaceId:'imported'};
 assert.equal(prepareFirstSpace(model,current).created,false);
 assert.deepEqual(model.spaces.map(s=>s.id),['imported']);
});
