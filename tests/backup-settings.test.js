import test from 'node:test';
import assert from 'node:assert/strict';
import {DEFAULT_DISCARD_EXCEPTIONS} from '../src/shared/auto-discard.js';
import {exportBackupSettings,restoreBackupSettings} from '../src/options/backup-settings.js';
test('backup round-trip preserves all appearance settings and fixed/autohide mode',()=>{
 for(const timeout of [0,400,500,600,700,800,900,1000,1100,1200]){
  const stored={arcSidebarAutohideTimeout:timeout,arcSidebarFavoriteSizePercent:120,arcSidebarOverlayWidth:512.5};
  assert.deepEqual(restoreBackupSettings(exportBackupSettings(stored)),{...stored,arcSidebarAutoDiscardMinutes:30,arcSidebarAutoDiscardExceptions:[...DEFAULT_DISCARD_EXCEPTIONS],arcSidebarEdgeTrigger:{height:100,offset:0,width:16},arcSidebarAutoPipEnabled:true,arcSidebarAutohideTimeout:timeout||800,arcSidebarMode:timeout===0?'native':'overlay'});
 }
 assert.deepEqual(exportBackupSettings({}),{autoDiscard:{minutes:30,exceptions:[...DEFAULT_DISCARD_EXCEPTIONS]},edgeTrigger:{height:100,offset:0,width:16},autoPipEnabled:true,autohideTimeout:800,sidebarMode:'overlay',favoriteSizePercent:100,sidebarWidth:390});
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

test('all device-local autohide preferences remain portable through backups',()=>{
 for(const mode of ['native','overlay']){
  const stored={arcSidebarMode:mode,arcSidebarAutohideTimeout:1200,arcSidebarEdgeTrigger:{height:35,offset:60,width:22},arcSidebarFavoriteSizePercent:50,arcSidebarOverlayWidth:512};
  const restored=restoreBackupSettings(exportBackupSettings(stored));
  for(const [key,value]of Object.entries(stored))assert.deepEqual(restored[key],value);
 }
});

test('automatic discard stays portable with exact steps, domain exceptions and older backups',()=>{
 const empty=restoreBackupSettings(exportBackupSettings({arcSidebarAutoDiscardExceptions:[]}));
 assert.deepEqual(empty.arcSidebarAutoDiscardExceptions,[], 'An intentionally empty exception list survives backup/restore');
 for(let minutes=0;minutes<=120;minutes+=5){
  const values={arcSidebarAutoDiscardMinutes:minutes,arcSidebarAutoDiscardExceptions:['meet.google.com','docs.example.com']};
  const restored=restoreBackupSettings(exportBackupSettings(values));
  assert.equal(restored.arcSidebarAutoDiscardMinutes,minutes);
  assert.deepEqual(restored.arcSidebarAutoDiscardExceptions,['docs.example.com','meet.google.com']);
 }
 for(const config of [null,{minutes:7,exceptions:[]},{minutes:'30',exceptions:[]},{minutes:30,exceptions:['chrome://settings']},{minutes:30,exceptions:'example.com'}])assert.throws(()=>restoreBackupSettings({autoDiscard:config}));
 assert.deepEqual(restoreBackupSettings({}),{});
});
