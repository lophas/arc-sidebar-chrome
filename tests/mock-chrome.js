export function mockChrome() {
  const listeners = new Map();
  const event = name => ({addListener(fn){const list=listeners.get(name)||[];list.push(fn);listeners.set(name,list);}});
  const emit = (name,...args) => (listeners.get(name)||[]).forEach(fn=>fn(...args));
  const data = {local:{},session:{}};
  let reads=0,writes=0,creates=0;
  const tabs = new Map([[10,{id:10,windowId:1,groupId:2,url:'https://a.test'}]]);
  const storage = area => ({
    async get(keys){reads++; await Promise.resolve(); const selected=keys==null?Object.keys(data[area]):typeof keys==='string'?[keys]:Array.isArray(keys)?keys:Object.keys(keys);return Object.fromEntries(selected.filter(k=>k in data[area]).map(k=>[k,structuredClone(data[area][k])]));},
    async set(values){writes++;const changes={};for(const [key,value] of Object.entries(values)){changes[key]={oldValue:data[area][key],newValue:structuredClone(value)};data[area][key]=structuredClone(value);}emit('storage',changes,area);},
    async clear(){const changes=Object.fromEntries(Object.entries(data[area]).map(([key,value])=>[key,{oldValue:value}]));data[area]={};emit('storage',changes,area);},
    async remove(keys){for(const key of typeof keys==='string'?[keys]:keys){delete data[area][key];}}
  });
  const chrome={storage:{local:storage('local'),session:storage('session'),onChanged:event('storage')},runtime:{id:'test',getURL:path=>'chrome-extension://test/'+path,onMessage:event('messages'),async sendMessage(message){return new Promise((resolve,reject)=>{let accepted=false;for(const fn of listeners.get('messages')||[]){if(fn(message,{id:'test',url:'chrome-extension://test/src/sidepanel/index.html'},resolve)===true)accepted=true;}if(!accepted)reject(new Error('Unhandled message'));});}},tabs:{onCreated:event('created'),onRemoved:event('removed'),onReplaced:event('replaced'),onUpdated:event('updated'),onMoved:event('moved'),async query(){return [...tabs.values()];},async get(id){if(!tabs.has(id))throw Error('No tab');return tabs.get(id);},async create(values){creates++;const tab={id:10+creates,windowId:1,groupId:-1,...values};tabs.set(tab.id,tab);return tab;},async update(id){return tabs.get(id);},async remove(id){tabs.delete(id);emit('removed',id);}},tabGroups:{async update(){}},windows:{async update(){}}};
  return {chrome,data,emit,tabs,counts:()=>({reads,writes,creates})};
}
