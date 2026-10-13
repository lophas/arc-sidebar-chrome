import test from 'node:test';
import assert from 'node:assert/strict';
let listener;
globalThis.chrome={runtime:{id:'test',getURL:path=>'chrome-extension://test/'+path,onMessage:{addListener:fn=>listener=fn}}};
const {fetchPageTitle}=await import('../src/background/page-title.js');
test('worker retrieves a closed page title with redirect support and preserves entities for UI decoding',async()=>{
 const calls=[];const result=await fetchPageTitle('https://index.test/',async(url,options)=>{calls.push({url,options});return {ok:true,text:async()=>'<html><head><TITLE data-x="1">Index &amp; hírek</TITLE></head></html>'};});
 assert.deepEqual(result,{ok:true,title:'Index &amp; hírek'});assert.equal(calls[0].options.redirect,'follow');assert.equal(calls[0].options.cache,'no-store');assert.equal(calls[0].options.credentials,'omit');
});
test('failed and titleless responses report their reason rather than disappearing silently',async()=>{
 assert.deepEqual(await fetchPageTitle('https://a.test',async()=>({ok:false,status:403})),{ok:false,error:'HTTP 403'});
 assert.deepEqual(await fetchPageTitle('https://a.test',async()=>{throw Error('Failed to fetch');}),{ok:false,error:'Failed to fetch'});
 assert.deepEqual(await fetchPageTitle('https://a.test',async()=>({ok:true,text:async()=>'<html></html>'})),{ok:false,error:'Page has no title'});
});
test('only web URLs and extension-owned sidebar senders can trigger worker requests',async()=>{
 let fetched=false;
 for(const url of ['not a url','chrome://settings/','javascript:alert(1)','file:///tmp/private'])assert.equal((await fetchPageTitle(url,async()=>{fetched=true;})).ok,false);
 assert.equal(fetched,false);
 for(const sender of [{id:'other',url:'chrome-extension://test/src/sidepanel/index.html'},{id:'test',url:'https://example.test/'}]){
  let response;assert.equal(listener({type:'arc-sidebar-page-title',url:'https://a.test'},sender,value=>response=value),undefined);assert.equal(response.error,'Invalid title lookup sender');
 }
});
