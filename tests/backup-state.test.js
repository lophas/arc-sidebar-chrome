import test from 'node:test';
import assert from 'node:assert/strict';
import { backupFolderState } from '../src/options/backup-state.js';
const model = {spaces:[{children:[{id:'outer',type:'folder',children:[{id:'inner',type:'folder',children:[]},{id:'link',type:'tab'}]},{id:'open',type:'folder',children:[]}]}]};
test('backup restores nested closed and open folders and discards stale folder IDs',()=>{
 const state={collapsedFolders:{outer:true,inner:true,open:false,deleted:true,link:true}};
 const saved=backupFolderState(model,state);
 assert.deepEqual(saved,{collapsedFolders:{outer:true,inner:true,open:false}});
 assert.deepEqual(backupFolderState(model,JSON.parse(JSON.stringify(saved))),saved);
});
test('old backups restore all folders expanded; malformed values cannot collapse folders',()=>{
 assert.deepEqual(backupFolderState(model),{collapsedFolders:{outer:false,inner:false,open:false}});
 assert.deepEqual(backupFolderState(model,{collapsedFolders:{outer:'true',inner:1,open:null}}),backupFolderState(model));
});
