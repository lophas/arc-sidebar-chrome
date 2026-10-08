import test from 'node:test';
import assert from 'node:assert/strict';
import { favoriteChildDestination, appendFavoriteChildren } from '../src/background/favorite-child-tabs.js';
const model={favorites:[{id:'fav',type:'tab',url:'https://gmail.test'}],spaces:[{id:'work',title:'Work'},{id:'other',title:'Other'}]};
const storage=(spaceId='work',bindings={fav:10},value=model)=>({local:{async get(){return structuredClone({arcSidebarModel:value,arcSidebarState:{currentSpaceId:spaceId}});}},session:{async get(){return {arcSidebarBindings:bindings};}}});
test('Favorite child captures the selected Space for foreground/background and other-window links',async()=>{
 for(const [active,windowId] of [[true,1],[false,1],[true,2]]){
  const tab={id:11,openerTabId:10,windowId,active};
  const candidate=await favoriteChildDestination(tab,storage());
  assert.deepEqual(candidate,{tabId:11,windowId,spaceId:'work'});
  const desired=new Map(),tabs=new Map([[11,{...tab,groupId:3}]]);
  appendFavoriteChildren(desired,[candidate],model,{fav:10},tabs);
  assert.deepEqual(desired.get(`${windowId}:work`).tabs,[tabs.get(11)]);
  assert.equal(desired.get(`${windowId}:work`).space.id,'work');
 }
});
test('Ordinary pinned/unbound openers and no valid selected Space keep normal Chrome behavior',async()=>{
 for(const [tab,s] of [[{id:11,windowId:1},storage()],[{id:11,windowId:1,openerTabId:22},storage('work',{pinned:22})],[{id:11,windowId:1,openerTabId:10},storage('__open_tabs__')],[{id:11,windowId:1,openerTabId:10},storage('deleted')]]) assert.equal(await favoriteChildDestination(tab,s),null);
});
test('Children share existing desired group entries without moving Favorites or saved tabs',()=>{
 const parent={id:10,windowId:1},saved={id:12,windowId:1},child={id:11,windowId:1};
 const desired=new Map([['1:work',{windowId:1,space:model.spaces[0],tabs:[saved]}],['1:__favorites__',{windowId:1,space:{id:'__favorites__'},tabs:[parent]}]]);
 const candidate={tabId:11,windowId:1,spaceId:'work'};
 appendFavoriteChildren(desired,[candidate,candidate,{...candidate,tabId:12},{...candidate,tabId:99}],model,{fav:10,pinned:12},new Map([[10,parent],[11,child],[12,saved]]));
 assert.deepEqual(desired.get('1:work').tabs,[saved,child]);assert.deepEqual(desired.get('1:__favorites__').tabs,[parent]);
});
test('Deleted Spaces and closed/moved/promoted children are ignored at group-sync time',()=>{
 const candidate={tabId:11,windowId:1,spaceId:'work'};
 for(const [m,bindings,tabs] of [[{...model,spaces:[]},{},new Map([[11,{id:11,windowId:1}]])],[model,{},new Map()],[model,{},new Map([[11,{id:11,windowId:2}]])],[model,{promoted:11},new Map([[11,{id:11,windowId:1}]])]]){
  const desired=new Map();appendFavoriteChildren(desired,[candidate],m,bindings,tabs);assert.equal(desired.size,0);
 }
});
