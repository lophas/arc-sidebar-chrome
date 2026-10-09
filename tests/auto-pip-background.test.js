import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
async function run(url,enabled) {
 const calls=[];const handlers={};const chrome={runtime:{onMessage:{addListener:fn=>handlers.message=fn}},tabs:{get:async id=>({id,url}),query:async()=>[{id:7,url}],onActivated:{addListener(){}},onUpdated:{addListener(){}}},storage:{local:{get:async()=>({arcSidebarAutoPipEnabled:enabled})},onChanged:{addListener(){}}},scripting:{executeScript:async request=>calls.push({world:request.world,files:request.files,args:request.args})}};
 const context={chrome,URL};vm.createContext(context);vm.runInContext(fs.readFileSync('src/background/auto-pip.js','utf8'),context);
 await vm.runInContext('sync(7)',context);return calls;
}
test('automatic PiP defaults enabled, prepares YouTube in page world and applies explicit off',async()=>{
 const on=await run('https://www.youtube.com/watch?v=test');
 assert.equal(on[0].world,'MAIN');assert.equal(on[0].files[0],'src/media/auto-pip.js');assert.equal(on.at(-1).args[0],true);
 const off=await run('https://music.youtube.com/watch?v=test',false);assert.equal(off.at(-1).args[0],false);
});
test('PiP injection excludes other sites, embedded lookalikes and browser pages',async()=>{
 for(const url of ['https://youtube.com.evil.test/watch','https://example.test','chrome://settings','http://youtube.com/watch'])assert.equal((await run(url)).length,0,url);
});
