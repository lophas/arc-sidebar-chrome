import test from 'node:test';
import assert from 'node:assert/strict';
test('layout replies read Chrome every time and recover from unsupported APIs',async()=>{
 let listener,side='left';
 globalThis.chrome={runtime:{onMessage:{addListener(fn){listener=fn;}}},sidePanel:{async getLayout(){return {side};}}};
 await import('../src/background/panel-layout.js');
 const request=()=>new Promise(resolve=>assert.equal(listener({type:'arc-sidebar-panel-layout'},{},resolve),true));
 assert.deepEqual(await request(),{side:'left'});
 side='right';assert.deepEqual(await request(),{side:'right'});
 chrome.sidePanel.getLayout=async()=>{throw new Error('unavailable');};
 assert.deepEqual(await request(),{side:'right'});
 assert.equal(listener({type:'unrelated'},{},()=>assert.fail()),undefined);
});
