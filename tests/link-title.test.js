import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { resolvePageTitle } from '../src/sidepanel/link-title.js';

test('page title uses the current URL, normalizes whitespace and ignores stale tab destinations',async()=>{
 globalThis.chrome={tabs:{query:async()=>[{url:'https://old.test',title:'Old title'},{url:'https://new.test/#section',title:' Fresh\n page   title '}]}};
 assert.equal(await resolvePageTitle('https://new.test/'),'Fresh page title');
 const originalFetch=globalThis.fetch;
 globalThis.fetch=async()=>{throw Error('unavailable');};
 try{assert.equal(await resolvePageTitle('https://unknown.test'),'');assert.equal(await resolvePageTitle('chrome://extensions/'),'');}finally{globalThis.fetch=originalFetch;}
});
function editor(title='',url='https://new.test') {
 const button={disabled:false,textContent:'Save',setAttribute(){},removeAttribute(){}};
 const fields={'#itemTitle':{value:title},'#itemUrl':{value:url},'#itemSave':button};
 const dialog={dataset:{editSession:'session'},open:true,querySelector:id=>fields[id]};
 return {dialog,fields,button};
}
function helper(resolvePageTitle) {
 const source=fs.readFileSync('src/sidepanel/manage.js','utf8');
 const context=vm.createContext({resolvePageTitle,validateUrlInput:input=>input.value.trim(),normalizeEnteredUrl:value=>value.trim(),uid:()=>''});
 vm.runInContext(source.slice(source.indexOf('function beginLinkEditing('),source.indexOf('function findNodeLocation(')),context);
 return context.prepareLinkSave;
}
test('the shared save path refreshes blank titles, preserves manual titles and falls back to the URL',async()=>{
 const requests=[];const prepare=helper(async url=>{requests.push(url);return 'Fresh title';});
 for(const title of ['', '  ']){const e=editor(title);const result=await prepare(e.dialog);assert.equal(result.title,'Fresh title');assert.equal(result.url,'https://new.test');assert.equal(e.button.disabled,false);}
 const e=editor(' Custom title ');assert.equal((await prepare(e.dialog)).title,'Custom title');assert.equal(requests.length,2);
 assert.equal((await helper(async()=> '')(editor().dialog)).title,'https://new.test');
});
test('cancel, switching editors, URL edits and repeated saves cannot apply a stale title lookup',async()=>{
 for(const change of [e=>e.dialog.open=false,e=>e.dialog.dataset.editSession='different',e=>e.fields['#itemUrl'].value='https://different.test']){
  let release;const e=editor(),prepare=helper(()=>new Promise(done=>release=done));
  const saving=prepare(e.dialog);assert.equal(await prepare(e.dialog),null,'repeat Save is ignored');change(e);release('Old result');assert.equal(await saving,null);
 }
 let release;const e=editor(),saving=helper(()=>new Promise(done=>release=done))(e.dialog);
 e.fields['#itemTitle'].value='Typed while loading';release('Fetched');assert.equal((await saving).title,'Typed while loading');
});
