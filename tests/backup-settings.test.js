import test from 'node:test';
import assert from 'node:assert/strict';
import {exportBackupSettings,restoreBackupSettings} from '../src/options/backup-settings.js';
test('backup round-trip preserves all appearance settings and fixed/autohide mode',()=>{
 for(const timeout of [0,400,500,600,700,800,900,1000,1100,1200]){
  const stored={arcSidebarAutohideTimeout:timeout,arcSidebarFavoriteSizePercent:120,arcSidebarOverlayWidth:512.5};
  assert.deepEqual(restoreBackupSettings(exportBackupSettings(stored)),{...stored,arcSidebarEdgeTrigger:{height:100,offset:0,width:16},arcSidebarAutoPipEnabled:true,arcSidebarAutohideTimeout:timeout||800,arcSidebarMode:timeout===0?'native':'overlay'});
 }
 assert.deepEqual(exportBackupSettings({}),{edgeTrigger:{height:100,offset:0,width:16},autoPipEnabled:true,autohideTimeout:800,sidebarMode:'overlay',favoriteSizePercent:100,sidebarWidth:390});
 assert.equal(exportBackupSettings({arcSidebarMode:'native'}).autohideTimeout,800);
});
test('old and partial backups leave absent preferences unchanged; unrelated keys cannot be restored',()=>{
 assert.deepEqual(restoreBackupSettings(undefined),{});
 assert.deepEqual(restoreBackupSettings({favoriteSizePercent:90,arcSidebarModel:{}}),{arcSidebarFavoriteSizePercent:90});
});
test('invalid settings reject restoration before any writes',()=>{
 for(const settings of [null,[],{autohideTimeout:100},{autohideTimeout:'800'},{favoriteSizePercent:999},{sidebarWidth:0},{sidebarWidth:NaN},{sidebarWidth:721}]) assert.throws(()=>restoreBackupSettings(settings));
});

test('edge trigger is backed up and invalid combinations are rejected',()=>{
 const stored={arcSidebarEdgeTrigger:{height:35,offset:60,width:10}};
 assert.deepEqual(restoreBackupSettings(exportBackupSettings(stored)).arcSidebarEdgeTrigger,stored.arcSidebarEdgeTrigger);
 for(const edgeTrigger of [{height:10,offset:0,width:16},{height:50,offset:51,width:16},{height:20,offset:0,width:23},{height:20,offset:0,width:'16'},null])assert.throws(()=>restoreBackupSettings({edgeTrigger}));
});

test('Favorite size backups preserve the complete slider range and reject off-step values',()=>{
 for(let size=50;size<=150;size+=10){
  assert.equal(restoreBackupSettings(exportBackupSettings({arcSidebarFavoriteSizePercent:size})).arcSidebarFavoriteSizePercent,size);
 }
 for(const size of [40,55,151,'100',null])assert.throws(()=>restoreBackupSettings({favoriteSizePercent:size}));
});
