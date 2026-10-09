import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { exportBackupSettings, restoreBackupSettings } from '../src/options/backup-settings.js';
function setup({ deferred=false }={}) {
  const events={}; const actions=new Map(); let requests=0, exits=0, resolveRequest;
  const document={pictureInPictureEnabled:true,visibilityState:'visible',pictureInPictureElement:null,querySelectorAll:()=>[video],addEventListener:(name,fn)=>{events[name]=fn;},removeEventListener:(name)=>{delete events[name];},exitPictureInPicture:async()=>{exits++;const target=document.pictureInPictureElement;document.pictureInPictureElement=null;events.leavepictureinpicture?.({target});}};
  const video={paused:false,ended:false,muted:false,volume:1,readyState:4,videoWidth:1280,videoHeight:720,disablePictureInPicture:false,requestPictureInPicture:()=>{requests++;if(deferred)return new Promise(resolve=>{resolveRequest=()=>{document.pictureInPictureElement=video;resolve();};});document.pictureInPictureElement=video;return Promise.resolve();}};
  const session={setActionHandler(action,handler){actions.set(action,handler);}};
  const window={};window.top=window;const context={window,document,navigator:{mediaSession:session}};vm.createContext(context);
  const source=fs.readFileSync('src/media/auto-pip.js','utf8');vm.runInContext(source,context);
  const controller=context.__arcSidebarAutoPip;
  const auto=()=>{document.visibilityState='hidden';return actions.get('enterpictureinpicture')({reason:'contentoccluded'});};
  const visible=()=>{document.visibilityState='visible';events.visibilitychange();};
  return {source,context,controller,video,document,session,actions,auto,visible,requests:()=>requests,exits:()=>exits,resolve:()=>resolveRequest()};
}
test('native automatic PiP returns only its own video to the source page; manual PiP stays open',async()=>{
 const s=setup();s.controller.configure(true);await s.auto();assert.equal(s.requests(),1);s.visible();assert.equal(s.exits(),1);
 s.document.pictureInPictureElement=s.video;await s.auto();s.visible();assert.equal(s.requests(),1);assert.equal(s.exits(),1);
});
test('paused, muted, ended and unsupported players never enter automatic PiP',async()=>{
 for(const [key,value] of [['paused',true],['muted',true],['volume',0],['ended',true],['readyState',1],['videoWidth',0],['disablePictureInPicture',true]]){
  const s=setup();s.controller.configure(true);s.video[key]=value;await s.auto();assert.equal(s.requests(),0,key);
 }
});
test('site handlers survive registration and disabling; manual action does not become owned PiP',async()=>{
 const s=setup();let manual=0;const site=async()=>{manual++;s.document.pictureInPictureElement=s.video;};
 s.session.setActionHandler('enterpictureinpicture',site);s.controller.configure(true);
 await s.actions.get('enterpictureinpicture')({reason:'useraction'});s.visible();assert.equal(manual,1);assert.equal(s.exits(),0);
 s.controller.configure(false);assert.equal(s.actions.get('enterpictureinpicture'),site);
});
test('quick return or disable during pending PiP closes it when request resolves; duplicate script does not wrap twice',async()=>{
 for(const disable of [false,true]){
  const s=setup({deferred:true});s.controller.configure(true);const pending=s.auto();
  if(disable)s.controller.configure(false);else s.visible();s.resolve();await pending;assert.equal(s.exits(),1);
  const setter=s.session.setActionHandler;vm.runInContext(s.source,s.context);assert.equal(s.context.__arcSidebarAutoPip,s.controller);assert.equal(s.session.setActionHandler,setter);
 }
});
test('permission errors stay contained and manual dismissal does not reopen before returning',async()=>{
 const s=setup();s.controller.configure(true);s.video.requestPictureInPicture=()=>Promise.reject(new Error('NotAllowedError'));await s.auto();assert.equal(s.exits(),0);
 const dismissed=setup();dismissed.controller.configure(true);await dismissed.auto();await dismissed.document.exitPictureInPicture();await dismissed.auto();assert.equal(dismissed.requests(),1);
 dismissed.visible();await dismissed.auto();assert.equal(dismissed.requests(),2);
});
test('automatic mini player preference defaults on and survives backups; older backups do not alter it',()=>{
 assert.equal(exportBackupSettings({}).autoPipEnabled,true);
 assert.equal(restoreBackupSettings(exportBackupSettings({arcSidebarAutoPipEnabled:false})).arcSidebarAutoPipEnabled,false);
 assert.equal(restoreBackupSettings({}).arcSidebarAutoPipEnabled,undefined);
 assert.throws(()=>restoreBackupSettings({autoPipEnabled:'true'}));
});
