import test from 'node:test';
import assert from 'node:assert/strict';
import { mergeChange, StateConflict, recalcModelStats } from '../src/shared/state-merge.js';
const clone = structuredClone;
const model = () => ({version:2,favorites:[{id:'fav',type:'tab',title:'Favorite',url:'https://fav.test'}],spaces:[{id:'s1',title:'First',children:[{id:'f1',type:'folder',title:'Folder',children:[{id:'a',type:'tab',title:'A',url:'https://a.test'},{id:'b',type:'tab',title:'B',url:'https://b.test'}]}]},{id:'s2',title:'Second',children:[]} ]});
test('independent node edits merge by ID',()=>{
const before=model(),after=clone(before),latest=clone(before);
after.spaces[0].children[0].children[0].title='New A';latest.spaces[0].children[0].children[1].icon='data:image/png;base64,xyz';
const result=mergeChange(latest,before,after);assert.equal(result.spaces[0].children[0].children[0].title,'New A');assert.equal(result.spaces[0].children[0].children[1].icon,'data:image/png;base64,xyz');});
test('reordering retains concurrently edited fields',()=>{
const before=model(),after=clone(before),latest=clone(before);after.spaces.reverse();latest.spaces[0].title='Renamed';
const result=mergeChange(latest,before,after);assert.deepEqual(result.spaces.map(s=>s.id),['s2','s1']);assert.equal(result.spaces[1].title,'Renamed');});
test('cross-Space move preserves hierarchy, icons and stats',()=>{
const before=model(),after=clone(before);const item=after.spaces[0].children[0].children.shift();item.icon='custom';after.spaces[1].children.push(item);
const result=recalcModelStats(mergeChange(before,before,after));assert.equal(result.spaces[1].children[0].id,'a');assert.equal(result.spaces[1].children[0].icon,'custom');assert.deepEqual(result.stats,{spaces:2,folders:1,tabs:2,favorites:1});});
test('concurrent edit vs deletion is rejected without mutating live model',()=>{
const before=model(),after=clone(before),latest=clone(before);after.spaces[0].children[0].children.shift();latest.spaces[0].children[0].children[0].title='Keep me';
const snapshot=clone(latest);assert.throws(()=>mergeChange(latest,before,after),StateConflict);assert.deepEqual(latest,snapshot);});
test('stale edits cannot resurrect deleted nodes',()=>{
const before=model(),after=clone(before),latest=clone(before);latest.spaces[0].children[0].children.shift();after.spaces[0].children[0].children[0].title='Stale';assert.throws(()=>mergeChange(latest,before,after),StateConflict);});
test('leaf state intentions preserve other collapsed folders',()=>{
const current={currentSpaceId:'s1',collapsedFolders:{one:true,two:true}};
const result=mergeChange(current,{}, {collapsedFolders:{one:false}},{strict:false});assert.deepEqual(result,{currentSpaceId:'s1',collapsedFolders:{one:false,two:true}});});
test('independent scroll keys merge and scalar intents take effect',()=>{
assert.deepEqual(mergeChange({s1:500,s2:80},{},{s2:120},{strict:false}),{s1:500,s2:120});assert.equal(mergeChange('s2','s1','s3',{strict:false}),'s3');});
test('favorite edits preserve a concurrently reordered list',()=>{
const before=[{id:'a',title:'A'},{id:'b',title:'B'}],after=clone(before),latest=clone(before).reverse();after[0].title='Updated';assert.deepEqual(mergeChange(latest,before,after),[{id:'b',title:'B'},{id:'a',title:'Updated'}]);});
test('incompatible simultaneous order changes are rejected',()=>{
const before=[{id:'a'},{id:'b'},{id:'c'}];assert.throws(()=>mergeChange([before[2],before[0],before[1]],before,[before[1],before[0],before[2]]),StateConflict);});
test('model import and cleared-state creation work',()=>{const next=model();assert.deepEqual(mergeChange(undefined,undefined,next),next);assert.deepEqual(mergeChange(undefined,{}, {currentSpaceId:'s1',collapsedFolders:{}},{strict:false}),{currentSpaceId:'s1',collapsedFolders:{}});});
