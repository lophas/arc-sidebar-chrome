import test from 'node:test';
import assert from 'node:assert/strict';
import {mockChrome} from './mock-chrome.js';
const mock=mockChrome();globalThis.chrome=mock.chrome;
mock.data.local.arcSidebarModel={favorites:[],spaces:[{id:'s',children:[{id:'a',type:'tab',url:'https://a.test'}]}]};
mock.data.local.arcSidebarPersistentBindings={a:{url:'https://a.test',normalizedUrl:'https://a.test/',index:0},deleted:{url:'https://a.test',normalizedUrl:'https://a.test/'}};
const {bindingsReady,restoreSessionBindings}=await import('../src/background/persistent-bindings.js');
const {openSavedItem}=await import('../src/background/tab-actions.js');
test('restart recovery runs without a sidebar and is awaited before opening',async()=>{const before=mock.counts().creates;const id=await openSavedItem('a',1);await bindingsReady;assert.equal(id,10);assert.equal(mock.counts().creates,before);assert.deepEqual(mock.data.session.arcSidebarBindings,{a:10});});

const settle = async () => { await new Promise(resolve => setTimeout(resolve, 30)); };
test('window shutdown preserves the latest navigated Favorite URL and late restoration reconnects', async () => {
  mock.data.local.arcSidebarModel.favorites.push({id:'favorite',type:'tab',url:'https://mail.test/'});
  mock.tabs.set(40,{id:40,windowId:2,groupId:3,url:'https://mail.test/inbox/123',title:'Message'});
  await chrome.storage.session.set({arcSidebarBindings:{a:10,favorite:40}});
  await settle();
  assert.equal(mock.data.local.arcSidebarPersistentBindings.favorite.url,'https://mail.test/inbox/123');
  mock.tabs.delete(40); mock.emit('removed',40,{isWindowClosing:true});
  await settle();
  assert.equal(mock.data.session.arcSidebarBindings.favorite,undefined);
  assert.equal(mock.data.local.arcSidebarPersistentBindings.favorite.url,'https://mail.test/inbox/123');
  mock.tabs.set(90,{id:90,windowId:3,groupId:4,url:'',pendingUrl:'https://mail.test/inbox/123',title:'Message'});
  mock.emit('created',mock.tabs.get(90));
  await settle();
  const before=mock.counts().creates;
  assert.equal(await openSavedItem('favorite',3),90);
  assert.equal(mock.counts().creates,before);
});
test('recovery rechecks late tabs on click even without a tab event', async () => {
  mock.tabs.delete(90); mock.emit('removed',90,{isWindowClosing:true}); await settle();
  mock.tabs.set(91,{id:91,windowId:3,groupId:4,url:'https://mail.test/inbox/123'});
  const before=mock.counts().creates;
  assert.equal(await openSavedItem('favorite',3),91);
  assert.equal(mock.counts().creates,before);
});
test('ordinary tab close forgets recovery metadata and original URL fallback reuses an existing tab', async () => {
  await chrome.tabs.remove(91); await settle();
  assert.equal(mock.data.local.arcSidebarPersistentBindings.favorite,undefined);
  mock.tabs.set(95,{id:95,windowId:3,groupId:4,url:'https://mail.test/'});
  const before=mock.counts().creates;
  assert.equal(await openSavedItem('favorite',3),95);
  assert.equal(mock.counts().creates,before);
});

test('startup cleanup of obsolete tab IDs retains metadata until the restored URL appears', async () => {
  const {serializeState}=await import('../src/background/state-controller.js');
  mock.tabs.delete(95);
  mock.data.session.arcSidebarBindings={a:10,favorite:95};
  mock.data.local.arcSidebarPersistentBindings.favorite={url:'https://mail.test/thread/456'};
  await serializeState(restoreSessionBindings);
  assert.equal(mock.data.local.arcSidebarPersistentBindings.favorite.url,'https://mail.test/thread/456');
  mock.tabs.set(96,{id:96,windowId:3,groupId:4,url:''});
  mock.emit('created',mock.tabs.get(96)); await settle();
  assert.equal(mock.data.session.arcSidebarBindings.favorite,undefined);
  mock.tabs.get(96).url='https://mail.test/thread/456';
  mock.emit('updated',96,{url:'https://mail.test/thread/456'});
  await settle();
  assert.equal(mock.data.session.arcSidebarBindings.favorite,96);
});
