import test from 'node:test';
import assert from 'node:assert/strict';
import {mockChrome} from './mock-chrome.js';
const mock=mockChrome();globalThis.chrome=mock.chrome;
mock.data.local.arcSidebarModel={favorites:[],spaces:[{id:'s',children:[{id:'a',type:'tab',url:'https://a.test'}]}]};
mock.data.local.arcSidebarPersistentBindings={a:{url:'https://a.test',normalizedUrl:'https://a.test/',index:0},deleted:{url:'https://a.test',normalizedUrl:'https://a.test/'}};
const {bindingsReady}=await import('../src/background/persistent-bindings.js');
const {openSavedItem}=await import('../src/background/tab-actions.js');
test('restart recovery runs without a sidebar and is awaited before opening',async()=>{const before=mock.counts().creates;const id=await openSavedItem('a',1);await bindingsReady;assert.equal(id,10);assert.equal(mock.counts().creates,before);assert.deepEqual(mock.data.session.arcSidebarBindings,{a:10});});
