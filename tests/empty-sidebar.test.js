import test from 'node:test';
import assert from 'node:assert/strict';
import {mockChrome} from './mock-chrome.js';
const mock=mockChrome();globalThis.chrome=mock.chrome;
const {ensureEmptySidebar}=await import('../src/background/empty-sidebar.js');
test('fresh and reset models contain Favorites but no Space; existing imports are never modified',async()=>{
 await ensureEmptySidebar();
 assert.deepEqual(mock.data.local.arcSidebarModel.favorites,[]);
 assert.deepEqual(mock.data.local.arcSidebarModel.spaces,[]);
 const imported={version:2,favorites:[{id:'fav',type:'tab',url:'https://a.test'}],spaces:[]};
 await chrome.storage.local.set({arcSidebarModel:imported});
 await Promise.all([ensureEmptySidebar(),ensureEmptySidebar()]);
 assert.deepEqual(mock.data.local.arcSidebarModel,imported);
 await chrome.storage.local.clear();
 await ensureEmptySidebar();
 assert.deepEqual(mock.data.local.arcSidebarModel.favorites,[]);
 assert.deepEqual(mock.data.local.arcSidebarModel.spaces,[]);
});
