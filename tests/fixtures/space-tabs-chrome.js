const event = () => { const listeners=[]; return {addListener:fn=>listeners.push(fn),emit:(...args)=>listeners.forEach(fn=>fn(...args))}; };
const data={local:{arcSidebarModel:{favorites:[],stats:{spaces:2,folders:0,tabs:2,favorites:0},spaces:[
 {id:'work',title:'Work',children:[{id:'a',type:'tab',title:'Saved A',url:'https://a.test'}]},
 {id:'other',title:'Other',children:[{id:'b',type:'tab',title:'Saved B',url:'https://b.test'}]}]},arcSidebarState:{currentSpaceId:'work',collapsedFolders:{}}},
 session:{arcSidebarBindings:{a:10,b:22},arcSidebarNativeGroups:{'1:work':2,'2:work':3,'1:other':4,'2:other':5}}};
const tabs=[{id:10,windowId:1,index:0,groupId:2,title:'Saved A',url:'https://a.test'},
 {id:11,windowId:1,index:1,groupId:2,title:'Workflow 11',url:'https://11.test'},
 {id:12,windowId:1,index:2,groupId:2,title:'Workflow 12',url:'https://12.test'},
 {id:21,windowId:2,index:0,groupId:3,title:'Other window workflow',url:'https://21.test'},
 {id:22,windowId:1,index:3,groupId:2,title:'Saved B',url:'https://b.test'},
 {id:30,windowId:1,index:4,groupId:4,title:'Other Space workflow',url:'https://30.test'}];
const changes=event(),calls=[];
const read=(area,keys)=>Object.fromEntries((typeof keys==='string'?[keys]:keys||Object.keys(data[area])).filter(k=>k in data[area]).map(k=>[k,structuredClone(data[area][k])]));
const write=async(area,values)=>{const diff={};for(const [key,value]of Object.entries(values)){diff[key]={oldValue:data[area][key],newValue:structuredClone(value)};data[area][key]=structuredClone(value);}changes.emit(diff,area);};
window.chrome={storage:{local:{get:async keys=>read('local',keys),set:values=>write('local',values)},session:{get:async keys=>read('session',keys)},onChanged:changes},
 windows:{getCurrent:async()=>({id:1})},runtime:{getURL:path=>location.origin+'/'+path,sendMessage:async message=>{
  calls.push(message);
  if(message.type==='arc-sidebar-tab-action')return {ok:true};
  const request=message.request;
  if(request.action==='snapshot')return {ok:true,values:Object.fromEntries(Object.entries(request.areas).map(([area,keys])=>[area,read(area,keys)]))};
  const operations=request.action==='batch'?request.operations:[request];
  for(const op of operations) await write(op.area,Object.fromEntries(op.changes.map(c=>[c.key,c.after])));
  return {ok:true,values:request.action==='batch'?data:read(request.area)};
 }},tabs:{query:async query=>structuredClone(query.currentWindow?tabs.filter(t=>t.windowId===1):tabs),remove:async id=>{tabs.splice(tabs.findIndex(t=>t.id===id),1);chrome.tabs.onRemoved.emit(id);},
 onCreated:event(),onRemoved:event(),onUpdated:event(),onActivated:event(),onMoved:event(),onAttached:event(),onDetached:event(),onReplaced:event()},
 tabGroups:{query:async()=>[{id:2,windowId:1,title:'Work'},{id:3,windowId:2,title:'Work'},{id:4,windowId:1,title:'Other'},{id:5,windowId:2,title:'Other'}],onCreated:event(),onUpdated:event(),onRemoved:event()}};
window.fixture={data,tabs,calls,write};
