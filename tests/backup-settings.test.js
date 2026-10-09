import test from 'node:test';
import assert from 'node:assert/strict';
import {exportBackupSettings,restoreBackupSettings} from '../src/options/backup-settings.js';
test('backup round-trip preserves all appearance settings and fixed/autohide mode',()=>{
 for(const timeout of [0,500,600,700,800,900,1000,1100]){
  const stored={arcSidebarAutohideTimeout:timeout,arcSidebarFavoriteSizePercent:120,arcSidebarOverlayWidth:512.5};
  assert.deepEqual(restoreBackupSettings(exportBackupSettings(stored)),{...stored,arcSidebarAutoPipEnabled:true,arcSidebarAutohideTimeout:timeout||800,arcSidebarMode:timeout===0?'native':'overlay'});
 }
 assert.deepEqual(exportBackupSettings({}),{autoPipEnabled:true,autohideTimeout:800,sidebarMode:'overlay',favoriteSizePercent:100,sidebarWidth:390});
 assert.equal(exportBackupSettings({arcSidebarMode:'native'}).autohideTimeout,800);
});
test('old and partial backups leave absent preferences unchanged; unrelated keys cannot be restored',()=>{
 assert.deepEqual(restoreBackupSettings(undefined),{});
 assert.deepEqual(restoreBackupSettings({favoriteSizePercent:90,arcSidebarModel:{}}),{arcSidebarFavoriteSizePercent:90});
});
test('invalid settings reject restoration before any writes',()=>{
 for(const settings of [null,[],{autohideTimeout:100},{autohideTimeout:'800'},{favoriteSizePercent:999},{sidebarWidth:0},{sidebarWidth:NaN},{sidebarWidth:721}]) assert.throws(()=>restoreBackupSettings(settings));
});
