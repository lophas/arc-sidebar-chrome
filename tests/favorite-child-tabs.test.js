import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { favoriteChildCandidate, appendFavoriteChildrenToUngroup } from '../src/background/favorite-child-tabs.js';
import { orderNativeGroups } from '../src/background/native-group-order.js';
import { pruneGroupMap } from '../src/background/native-group-map.js';
const model={favorites:[{id:'fav',type:'tab',url:'https://gmail.test'}],spaces:[{id:'work',title:'Work',children:[{id:'pin',type:'tab',url:'https://work.test'}]},{id:'other',title:'Other'}]};
const storage=(spaceId='work',bindings={fav:10},value=model)=>({local:{async get(){return structuredClone({arcSidebarModel:value,arcSidebarState:{currentSpaceId:spaceId}});}},session:{async get(){return {arcSidebarBindings:bindings};}}});
test('Favorite children are ungroup candidates regardless of selected Space, focus or window',async()=>{
 for(const spaceId of ['work','other','__open_tabs__','deleted',null,undefined]){
  for(const [active,windowId] of [[true,1],[false,1],[true,2]]){
   const tab={id:11,openerTabId:10,windowId,active};
   assert.deepEqual(await favoriteChildCandidate(tab,storage(spaceId)),{tabId:11,windowId});
  }
 }
 assert.deepEqual(await favoriteChildCandidate({id:11,openerTabId:10,windowId:1},storage('work',{fav:10},{favorites:model.favorites,spaces:[]})),{tabId:11,windowId:1});
});
test('Space pinned links and unbound openers retain normal Chrome grouping',async()=>{
 for(const [tab,s] of [[{id:11,windowId:1},storage()],[{id:11,windowId:1,openerTabId:22},storage('work',{pin:22})],[{id:11,windowId:1,openerTabId:10},storage('work',{})],[{id:11,windowId:1,openerTabId:10},storage('work',{fav:10},null)]]) assert.equal(await favoriteChildCandidate(tab,s),null);
});
test('ungroup candidates are deduplicated and skip closed, moved, native pinned and newly saved children',()=>{
 const child={id:11,windowId:1,groupId:2},saved={id:12,windowId:1,groupId:3},pinned={id:13,windowId:1,pinned:true},moved={id:14,windowId:2};
 const candidate={tabId:11,windowId:1},tabs=new Map([child,saved,pinned,moved].map(tab=>[tab.id,tab])),ungroup=[child];
 appendFavoriteChildrenToUngroup(ungroup,[candidate,candidate,...[12,13,14,99].map(tabId=>({tabId,windowId:1}))],{fav:10,pin:12},tabs);
 assert.deepEqual(ungroup,[child]);
});
test('serialized worker sync ungroups only Favorite children, preserving Favorites and Space workflow groups',async()=>{
 const favoritesGroup={id:'__favorites__',title:'Favorites',color:'grey'};
 const tabs=[{id:31,windowId:1,groupId:-1,index:0,pinned:true},{id:10,windowId:1,groupId:2,index:1},{id:11,windowId:1,groupId:2,index:2,openerTabId:10},{id:20,windowId:1,groupId:3,index:3},{id:21,windowId:1,groupId:3,index:4,openerTabId:20},{id:32,windowId:1,groupId:3,index:5},{id:30,windowId:1,groupId:7,index:6},{id:33,windowId:1,groupId:-1,index:7}];
 const groups=[{id:2,windowId:1,title:'Favorites',color:'grey'},{id:3,windowId:1,title:'Work',color:'blue'},{id:7,windowId:1,title:'Unrelated',color:'red'}];
 const bindings={fav:10,pin:20,promoted:32};
 const current=structuredClone(model);current.spaces[0].children.push({id:'promoted',type:'tab'});
 const data={arcSidebarModel:current,arcSidebarBindings:bindings,arcSidebarNativeGroups:{'1:__favorites__':2,'1:work':3}};
 const ungrouped=[],grouped=[];
 const read=async keys=>Object.fromEntries((Array.isArray(keys)?keys:[keys]).filter(key=>key in data).map(key=>[key,structuredClone(data[key])]));
 const chrome={tabs:{query:async({windowId}={})=>tabs.filter(tab=>windowId==null||tab.windowId===windowId),ungroup:async ids=>{ungrouped.push(...ids);for(const tab of tabs)if(ids.includes(tab.id))tab.groupId=-1;},group:async({tabIds,groupId})=>{assert.ok(groupId!=null,'existing groups must be reused');grouped.push(...tabIds);for(const tab of tabs)if(tabIds.includes(tab.id))tab.groupId=groupId;return groupId;}},tabGroups:{move:async(id,{index})=>{const members=tabs.filter(tab=>tab.groupId===id),rest=tabs.filter(tab=>tab.groupId!==id);rest.splice(index,0,...members);tabs.splice(0,tabs.length,...rest);tabs.forEach((tab,index)=>tab.index=index);},get:async id=>groups.find(group=>group.id===id),query:async()=>groups,update:async(id,values)=>Object.assign(groups.find(group=>group.id===id),values)}};
 globalThis.chrome=chrome;
 const candidates=new Map([11,31,32,33,99].map(tabId=>[tabId,{tabId,windowId:1}]));
 const context=vm.createContext({chrome,sidebarStorage:{local:{get:read},session:{get:read,set:async values=>Object.assign(data,values)}},STORAGE_KEY:'arcSidebarModel',BINDINGS_KEY:'arcSidebarBindings',GROUP_MAP_KEY:'arcSidebarNativeGroups',TAB_ID_NONE:-1,FAVORITES_GROUP:favoritesGroup,GROUP_COLORS:['blue'],pendingFavoriteChildren:candidates,groupSyncRunning:false,groupSyncPending:false,groupSyncTimer:null,releaseGroupVisibility:null,appendFavoriteChildrenToUngroup,orderNativeGroups,pruneGroupMap,console});
 const source=fs.readFileSync('src/background/service-worker.js','utf8');
 vm.runInContext(source.slice(source.indexOf('function buildSpaceIndex('),source.indexOf('function queueNativeGroupSync(')),context);
 await context.syncNativeGroupsNow();
 assert.deepEqual(ungrouped,[11]);assert.deepEqual(grouped,[]);
 assert.equal(tabs.find(tab=>tab.id===10).groupId,2,'Favorite parent remains in Favorites');
 assert.equal(tabs.find(tab=>tab.id===20).groupId,3,'Space pinned parent remains in Work');
 assert.equal(tabs.find(tab=>tab.id===21).groupId,3,'Space child stays in its opener’s group');
 assert.equal(tabs.find(tab=>tab.id===32).groupId,3,'a child saved into a Space meanwhile keeps that destination');
 assert.equal(tabs.find(tab=>tab.id===30).groupId,7,'unrelated groups are untouched');
 assert.equal(candidates.size,0);
 await context.syncNativeGroupsNow();assert.deepEqual(ungrouped,[11],'later syncs do not group the child again');
});
