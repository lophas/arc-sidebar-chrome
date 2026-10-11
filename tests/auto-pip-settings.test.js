import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { autoPipSite, openAutoPipSiteSettings, AUTO_PIP_SETTINGS_URL } from '../src/shared/auto-pip-settings.js';

test('guide uses the HTTPS origin without credentials, path or private query data', () => {
 const site=autoPipSite({url:'https://user:secret@example.test:8443/video?token=private#time'});
 assert.deepEqual(site,{host:'example.test:8443',origin:'https://example.test:8443',settingsUrl:AUTO_PIP_SETTINGS_URL});
 assert.equal(autoPipSite({url:'https://old.test',pendingUrl:'https://new.test/player'}).host,'new.test');
 for(const url of ['chrome://settings','http://example.test','file:///video','about:blank','invalid'])assert.equal(autoPipSite({url}),null);
});

test('settings open beside the guide source tab in its own window and never navigate the video',async()=>{
 const calls=[];let tab={id:12,windowId:7,url:'https://video.test/watch',index:5};
 const browser={tabs:{get:async id=>{calls.push(['get',id]);return tab;},create:async options=>calls.push(options)}};
 await openAutoPipSiteSettings(12,browser);
 assert.deepEqual(calls,[['get',12],{url:AUTO_PIP_SETTINGS_URL,windowId:7,index:6}]);
 tab={url:'chrome://settings'};await assert.rejects(openAutoPipSiteSettings(12,browser),/HTTPS video page/);
 assert.equal(calls.length,3);
});

test('only the extension top-frame guide can open the fixed PiP route, without trusting a supplied tab or URL',async()=>{
 let listener;const calls=[];
 const chrome={runtime:{id:'test',onMessage:{addListener:fn=>{listener=fn;}}}};
 const source=fs.readFileSync('src/background/auto-pip-settings.js','utf8').replace(/^import .*;\n/gm,'');
 vm.runInNewContext(source,{chrome,autoPipSite,openAutoPipSiteSettings:async id=>calls.push(id)});
 const sender={id:'test',frameId:0,tab:{id:12,url:'https://video.test'}};
 const send=s=>new Promise(resolve=>listener({type:'arc-auto-pip-open-settings',tabId:99,url:'https://untrusted.test'},s,resolve));
 assert.equal((await send(sender)).ok,true);assert.deepEqual(calls,[12]);
 for(const s of [{...sender,id:'other'}, {...sender,frameId:2}, {...sender,tab:{id:12,url:'chrome://settings'}}])assert.equal((await send(s)).ok,false);
 assert.deepEqual(calls,[12]);
});
