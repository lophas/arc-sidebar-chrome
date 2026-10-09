import test from 'node:test';
import assert from 'node:assert/strict';
import { sidebarPreferences } from '../src/shared/sidebar-preferences.js';
import { exportBackupSettings, restoreBackupSettings } from '../src/options/backup-settings.js';
test('fresh state uses autohide; existing preferences and legacy disabled timeout migrate', () => {
  assert.deepEqual(sidebarPreferences({}), { mode: 'overlay', timeout: 800 });
  assert.deepEqual(sidebarPreferences({ arcSidebarMode: 'overlay' }), { mode: 'overlay', timeout: 800 });
  assert.deepEqual(sidebarPreferences({ arcSidebarAutohideTimeout: 0, arcSidebarMode: 'overlay' }), { mode: 'native', timeout: 800 });
  assert.deepEqual(sidebarPreferences({ arcSidebarMode: 'native', arcSidebarAutohideTimeout: 600 }), { mode: 'native', timeout: 600 });
});
test('backup preserves fixed mode separately from its remembered autohide timeout', () => {
  const stored = { arcSidebarMode: 'native', arcSidebarAutohideTimeout: 1100 };
  const restored = restoreBackupSettings(exportBackupSettings(stored));
  assert.equal(restored.arcSidebarMode, 'native');
  assert.equal(restored.arcSidebarAutohideTimeout, 1100);
  assert.equal(restoreBackupSettings({ autohideTimeout: 0 }).arcSidebarMode, 'native');
  assert.throws(() => restoreBackupSettings({ sidebarMode: 'wrong' }));
});
