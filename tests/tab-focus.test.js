import test from 'node:test';
import assert from 'node:assert/strict';
import { watchTabFocus, selectSidebarSpace } from '../src/background/tab-focus.js';

const KEY = 'arcSidebarFavoriteChildFocus';
function fixture(persisted = {}) {
  const listeners = {}, tabs = new Map(), updates = [], selected = [], data = structuredClone(persisted);
  const event = name => ({ addListener: fn => { (listeners[name] ||= []).push(fn); } });
  const browser = { storage: {session: {get: async()=>structuredClone(data), set: async values=>Object.assign(data, structuredClone(values))}}, tabs: {
    onActivated:event('active'), onRemoved:event('removed'), onDetached:event('detached'),
    get:async id=> { if(!tabs.has(id)) throw Error('closed'); return {...tabs.get(id)}; },
    query:async options=>[...tabs.values()].filter(tab=>tab.windowId===options.windowId && tab.active),
    update:async(id,values)=> { updates.push({id,values}); for(const tab of tabs.values()) if(tab.windowId===tabs.get(id).windowId) tab.active=tab.id===id; return tabs.get(id); }
  }};
  const watcher=watchTabFocus(async info=>selected.push(info.tabId),browser);
  const emit=(name,...args)=>listeners[name]?.forEach(fn=>fn(...args));
  const activate=id=> { for(const tab of tabs.values()) if(tab.windowId===tabs.get(id).windowId) tab.active=tab.id===id; emit('active',{tabId:id,windowId:tabs.get(id).windowId}); };
  const close=(id,isWindowClosing=false)=> {const tab=tabs.get(id);tabs.delete(id);emit('removed',id,{windowId:tab.windowId,isWindowClosing}); if(tab.active&&!isWindowClosing){const next=[...tabs.values()].find(t=>t.windowId===tab.windowId);if(next)activate(next.id);}};
  const add=tab=>tabs.set(tab.id,{windowId:1,active:false,...tab});
  const track=async id=> { const tab=tabs.get(id);await watcher.track({tabId:id,windowId:tab.windowId,openerTabId:tab.openerTabId}); };
  return {browser,watcher,tabs,updates,selected,data,emit,activate,close,add,track};
}
test('closing an active Favorite child returns to its own opener, even after switching away and back',async()=>{
 const f=fixture();f.add({id:3});f.add({id:10});f.add({id:11,openerTabId:10,active:true});await f.track(11);
 f.activate(3);f.activate(11);await f.watcher.settled();f.close(11);await f.watcher.settled();
 assert.deepEqual(f.updates,[{id:10,values:{active:true}}]);assert.deepEqual(f.data[KEY],{});
});
test('each Favorite child returns to the parent rather than another open child',async()=>{
 const f=fixture();f.add({id:12,openerTabId:10});f.add({id:10});f.add({id:11,openerTabId:10,active:true});await f.track(12);await f.track(11);
 f.close(11);await f.watcher.settled();assert.equal(f.updates[0].id,10);assert.ok(f.tabs.has(12));
});
test('a user selection immediately after closing wins before return processing starts',async()=>{
 const f=fixture();f.add({id:3});f.add({id:4});f.add({id:10});f.add({id:11,openerTabId:10,active:true});await f.track(11);
 f.close(11);f.activate(4);await f.watcher.settled();assert.deepEqual(f.updates,[]);
});
test('background closes, window closes and an already closed opener do not change focus',async()=>{
 for(const mode of ['background','window','opener']){
  const f=fixture();f.add({id:3,active:mode==='background'});f.add({id:10});f.add({id:11,openerTabId:10,active:mode!=='background'});await f.track(11);
  if(mode==='opener'){f.close(10);await f.watcher.settled();}
  f.close(11,mode==='window');await f.watcher.settled();assert.deepEqual(f.updates,[],mode);
 }
});
test('Favorite-child focus survives service-worker suspension using session storage',async()=>{
 const f=fixture({[KEY]:{11:{openerTabId:10,windowId:1,active:true}}});f.add({id:3});f.add({id:10});f.add({id:11,active:true});
 f.close(11);await f.watcher.settled();assert.equal(f.updates[0].id,10);
});
test('moving a child or opener to another window discards its return relationship',async()=>{
 for(const id of [10,11]){const f=fixture();f.add({id:10});f.add({id:11,openerTabId:10,active:true});await f.track(11);f.emit('detached',id);await f.watcher.settled();f.close(11);await f.watcher.settled();assert.deepEqual(f.updates,[]);}
});
test('a new user tab selection during return lookup wins over automatic focus',async()=>{
 const f=fixture();f.add({id:3});f.add({id:4});f.add({id:10});f.add({id:11,openerTabId:10,active:true});await f.track(11);
 let release,started;const gate=new Promise(resolve=>release=resolve),ready=new Promise(resolve=>started=resolve);const get=f.browser.tabs.get;
 f.browser.tabs.get=async id=>{if(id===10){started();await gate;}return get(id);};
 f.close(11);await ready;f.activate(4);release();await f.watcher.settled();assert.deepEqual(f.updates,[]);
});
function spaceFixture(tab, {current='a',map={'1:b':7},bindings={pin:10},group={id:7,windowId:1,title:'B'}}={}){
 const model={spaces:[{id:'a',title:'A',children:[]},{id:'b',title:'B',children:[{type:'folder',children:[{type:'tab',id:'pin'}]}]}]};
 const state={currentSpaceId:current,collapsedFolders:{folder:true}},patches=[];
 const storage={snapshot:async()=>({local:{arcSidebarModel:model,arcSidebarState:state},session:{arcSidebarBindings:bindings,arcSidebarNativeGroups:map}}),local:{patch:async(key,patch)=>{patches.push({key,patch});Object.assign(state,patch);}}};
 const browser={tabs:{get:async()=>tab,query:async()=>[tab]},tabGroups:{get:async()=>group}};
 return {storage,browser,state,patches};
}
test('Chrome tab focus selects the owning Space for nested pinned links and workflow group tabs',async()=>{
 for(const tab of [{id:10,windowId:1,groupId:-1},{id:11,windowId:1,groupId:7}]){
  const f=spaceFixture(tab);await selectSidebarSpace({tabId:tab.id,windowId:1},()=>true,f.storage,f.browser);
  assert.equal(f.state.currentSpaceId,'b');assert.deepEqual(f.state.collapsedFolders,{folder:true});assert.deepEqual(f.patches,[{key:'arcSidebarState',patch:{currentSpaceId:'b'}}]);
 }
});
test('Favorites, ungrouped, native pinned, unrelated groups and stale focus keep the current Space',async()=>{
 for(const [tab,options,valid] of [[{id:12,windowId:1,groupId:-1},{bindings:{fav:12}},true],[{id:11,windowId:1,groupId:-1},{},true],[{id:10,windowId:1,groupId:7,pinned:true},{},true],[{id:11,windowId:1,groupId:7},{group:{id:7,windowId:1,title:'Unrelated'}},true],[{id:10,windowId:1,groupId:7},{},false],[{id:10,windowId:1,groupId:7},{current:'b'},true]]){
  const f=spaceFixture(tab,options);await selectSidebarSpace({tabId:tab.id,windowId:1},()=>valid,f.storage,f.browser);assert.deepEqual(f.patches,[]);
 }
 const f=spaceFixture({id:10,windowId:1,groupId:-1});f.browser.tabs.query=async()=>[{id:99}];await selectSidebarSpace({tabId:10,windowId:1},()=>true,f.storage,f.browser);assert.deepEqual(f.patches,[]);
});
