import test from 'node:test';
import assert from 'node:assert/strict';
import { orderNativeGroups } from '../src/background/native-group-order.js';
const favorite = {id:'__favorites__',title:'Favorites'};
const model = {spaces:[{id:'a',title:'A'},{id:'b',title:'B'}]};
function fixture() {
  const groups = [{id:1,windowId:1,title:'A'},{id:2,windowId:1,title:'B'},{id:3,windowId:1,title:'Favorites'},{id:4,windowId:2,title:'A'},{id:5,windowId:2,title:'Favorites'},{id:6,windowId:1,title:'Unrelated'}];
  const strips = new Map([[1,[-1,2,2,6,1,1,3]],[2,[-1,4,5]]]);
  const moves=[];
  globalThis.chrome={tabs:{async query({windowId}) {return strips.get(windowId).map((groupId,index)=>({groupId,index,windowId,pinned:index===0}));}},tabGroups:{async query(){return groups;},async move(id,{index}) {
    const windowId=groups.find(group=>group.id===id).windowId;
    const strip=strips.get(windowId);
    assert.ok(index>0,'never cross native pinned tabs');
    assert.ok(index===strip.length || index===0 || strip[index]!==strip[index-1],'never split another group');
    const members=strip.filter(groupId=>groupId===id);
    const rest=strip.filter(groupId=>groupId!==id);
    rest.splice(index,0,...members);strips.set(windowId,rest);moves.push(id);
  }}};
  return {strips,moves,map:{'1:a':1,'1:b':2,'1:__favorites__':3,'2:a':4,'2:__favorites__':5}};
}
test('late Favorites group moves before Space groups in every window, with workflow tabs intact',async()=>{
  const f=fixture();await orderNativeGroups(model,f.map,favorite);
  assert.deepEqual(f.strips.get(1),[-1,3,1,1,2,2,6]);
  assert.deepEqual(f.strips.get(2),[-1,5,4]);
  const count=f.moves.length;await orderNativeGroups(model,f.map,favorite);
  assert.equal(f.moves.length,count,'stable order does not move groups again');
});
test('Space reorder updates Chrome order and stale mappings never move unrelated groups',async()=>{
  const f=fixture();f.map['1:a']=6;
  await orderNativeGroups({spaces:[...model.spaces].reverse()},f.map,favorite);
  assert.deepEqual(f.strips.get(1),[-1,3,2,2,6,1,1]);
  assert.ok(!f.moves.includes(6));
});
