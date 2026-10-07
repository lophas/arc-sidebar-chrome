import test from 'node:test';
import assert from 'node:assert/strict';
import { moveFavoriteToSpace } from '../src/shared/favorite-moves.js';
const fixture=()=>({favorites:[{id:'fav',type:'tab',title:'Favorite',url:'https://favorite.test',icon:'custom',extra:{keep:true}}],spaces:[{id:'work',children:[{id:'first',type:'tab'},{id:'folder',type:'folder',children:[{id:'nested',type:'tab'}]},{id:'empty',type:'folder',children:[]}]}]});
test('Favorite moves at exact root/nested positions, retaining its identity and all metadata',()=>{
 for(const [position,expected] of [[{targetNodeId:'first'},['fav','first','folder','empty']],[{targetNodeId:'folder',after:true},['first','folder','fav','empty']]]){
  const model=fixture(),item=model.favorites[0];assert.equal(moveFavoriteToSpace(model,'fav','work',position),true);
  assert.deepEqual(model.spaces[0].children.map(n=>n.id),expected);assert.equal(model.favorites.length,0);assert.equal(model.spaces[0].children.find(n=>n.id==='fav'),item);
 }
 for(const position of [{targetNodeId:'nested',after:true},{folderId:'folder'}]){
  const model=fixture();assert.equal(moveFavoriteToSpace(model,'fav','work',position),true);
  assert.deepEqual(model.spaces[0].children[1].children.map(n=>n.id),['nested','fav']);assert.equal(model.spaces[0].children[1].children[1].icon,'custom');
 }
 const model=fixture();assert.equal(moveFavoriteToSpace(model,'fav','work',{folderId:'empty'}),true);assert.equal(model.spaces[0].children[2].children[0].id,'fav');
 const empty={favorites:fixture().favorites,spaces:[{id:'work'}]};assert.equal(moveFavoriteToSpace(empty,'fav','work'),true);assert.equal(empty.spaces[0].children[0].id,'fav');
});
test('Missing/deleted destinations, Open-tabs and repeated drops cannot lose or duplicate Favorites',()=>{
 for(const [id,space,position] of [['missing','work',{}],['fav','missing',{}],['fav','__open_tabs__',{}],['fav','work',{targetNodeId:'deleted'}],['fav','work',{folderId:'first'}]]){
  const model=fixture(),before=structuredClone(model);assert.equal(moveFavoriteToSpace(model,id,space,position),false);assert.deepEqual(model,before);
 }
 const model=fixture();moveFavoriteToSpace(model,'fav','work');const before=structuredClone(model);assert.equal(moveFavoriteToSpace(model,'fav','work'),false);assert.deepEqual(model,before);
});
