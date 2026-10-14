// Review-only screenshot proposals: no source or storage schema changes.
import {chromium} from 'playwright-core';
import {writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
const palettes=[
 {id:'blue',name:'Ocean',emoji:'🌊',colors:['#1855c9','#10b5c2']},
 {id:'green',name:'Forest',emoji:'🌿',colors:['#15803d','#80b426']},
 {id:'purple',name:'Aurora',emoji:'🔮',colors:['#6920ca','#db337b']},
 {id:'orange',name:'Amber',emoji:'🔥',colors:['#e76b17','#d69d19']},
 {id:'cyan',name:'Lagoon',emoji:'🐬',colors:['#087b91','#16b6a2']},
 {id:'pink',name:'Blossom',emoji:'🌸',colors:['#d72f92','#a233ce']},
 {id:'red',name:'Sunset',emoji:'🌅',colors:['#c92e43','#ed7438']},
 {id:'yellow',name:'Citrus',emoji:'🍋',colors:['#b28c05','#86a81a']},
 {id:'grey',name:'Slate',emoji:'🪨',colors:['#52637a','#797085']}
];
const rgb=c=>[1,3,5].map(i=>parseInt(c.slice(i,i+2),16));
const blend=(c,b,a)=>'#'+rgb(c).map((v,i)=>Math.round(v*a+rgb(b)[i]*(1-a)).toString(16).padStart(2,'0')).join('');
const gradient=(p,a)=>`linear-gradient(155deg,${p.colors.map(c=>blend(c,'#11141b',a)).join(',')})`;
const extension=resolve('.');
const context=await chromium.launchPersistentContext('',{channel:'chromium',headless:false,viewport:{width:360,height:700},ignoreDefaultArgs:['--disable-extensions'],args:['--no-sandbox',`--disable-extensions-except=${extension}`,`--load-extension=${extension}`]});
try {
 let [worker]=context.serviceWorkers();if(!worker)worker=await context.waitForEvent('serviceworker');
 const page=await context.newPage();await page.emulateMedia({colorScheme:'dark'});
 await page.goto(`chrome-extension://${worker.url().split('/')[2]}/src/sidepanel/index.html`);
 await page.locator('.space-button[data-space-id="__my_space__"]').waitFor();
 await page.evaluate(async()=>{
  const tab=(id,title,url)=>({id,type:'tab',title,url});
  await chrome.storage.local.set({arcSidebarFavoriteSizePercent:100,arcSidebarModel:{version:2,favorites:[tab('gmail','Gmail','https://mail.google.com/'),tab('facebook','Facebook','https://facebook.com/'),tab('messenger','Messenger','https://messenger.com/'),tab('whatsapp','WhatsApp','https://whatsapp.com/'),tab('youtube','YouTube','https://youtube.com/'),tab('chatgpt','ChatGPT','https://chatgpt.com/'),tab('calendar','Calendar','https://calendar.google.com/'),tab('maps','Maps','https://maps.google.com/')],spaces:[{id:'work',title:'Work',emoji:'💼',palette:{kind:'preset',id:'blue'},children:[{id:'projects',type:'folder',title:'Projects',children:[tab('github','GitHub','https://github.com/'),tab('docs','Documents','https://docs.google.com/')]},{id:'news',type:'folder',title:'Readings',children:[tab('index','Index.hu','https://index.hu/')]},tab('design','Design references','https://zen-browser.app/'),tab('tasks','Weekly plan','https://example.com/plan')]},{id:'home',title:'Personal',emoji:'🏠',palette:{kind:'preset',id:'green'},children:[]},{id:'studio',title:'Studio',emoji:'🎨',palette:{kind:'preset',id:'purple'},children:[]}],stats:{spaces:3,folders:2,tabs:5,favorites:8}},arcSidebarState:{currentSpaceId:'work',collapsedFolders:{projects:false,news:true}}});
 });
 await page.locator('.favorite-tile').nth(7).waitFor();
 // Deterministic local icon fixtures keep screenshots independent of network access.
 await page.evaluate(()=>{
  const icons=[['G','#ea4335'],['f','#1877f2'],['↗','#2379ef'],['☎','#25bd65'],['▶','#ff0033'],['◎','#f5f5f5'],['14','#3778f6'],['◆','#34a853']];
  document.querySelectorAll('.favorite-tile img,.favorite-tile .favicon-fallback').forEach((el,i)=>{
   const [t,c]=icons[i];const span=document.createElement('span');span.textContent=t;span.style.cssText=`display:grid;place-items:center;width:27px;height:27px;border-radius:7px;background:${i===5?'transparent':c};color:${i===5?c:'#fff'};font:700 23px Arial`;el.replaceWith(span);
  });
  // Sample open-state markers, unchanged size and position from the current UI.
  document.querySelectorAll('.favorite-tile').forEach((el,i)=>{if(i===5)return;el.classList.add('has-binding');const dot=document.createElement('span');dot.className='favorite-reset live-dot-close';el.append(dot);});
  const s=document.createElement('style');s.textContent='.space-palette-mark{display:none!important}.favorite-tile{border:1px solid var(--proposal-favorite-border)!important;background:var(--proposal-favorite-bg)!important;box-shadow:0 2px 7px rgba(0,0,0,.09),inset 0 1px 0 rgba(255,255,255,.025)}.space-button.active{outline-color:var(--space-accent)!important}';document.head.append(s);
 });
 const shots=[];
 for(const [variant,amount,border,tile] of [['A',.40,.20,.10],['B',.60,.28,.16]]){
  for(const p of [palettes[0],palettes[3],palettes[2]]){
   const vars={'--space-background':gradient(p,amount),'--bg':blend(p.colors[0],'#11141b',amount),'--panel':blend(p.colors[0],'#191d25',.28),'--text':'#f4f6fb','--muted':'#cbd2dd','--space-accent':blend(p.colors[0],'#ffffff',.55),'--border':'rgba(255,255,255,.20)','--hover':'rgba(255,255,255,.12)','--active':'rgba(255,255,255,.18)','--proposal-favorite-border':`rgba(255,255,255,${border})`,'--proposal-favorite-bg':`rgba(255,255,255,${tile})`};
   await page.evaluate(vars=>{for(const [k,v] of Object.entries(vars))document.documentElement.style.setProperty(k,v);},vars);
   await page.mouse.move(350,380);await page.screenshot({path:`/tmp/palette-${variant}-${p.id}.png`});
   shots.push({variant,p,image:(await page.screenshot()).toString('base64')});
  }
 }
 const board=await context.newPage();await board.setViewportSize({width:1160,height:1780});
 await board.setContent(`<!doctype html><html><head><style>*{box-sizing:border-box}body{margin:0;background:#11151c;color:#edf0f7;font-family:Arial,sans-serif;padding:28px}h1{margin:0 0 7px;font-size:25px}p{margin:0;color:#adb6c8;font-size:13px}.section{margin-top:24px}h2{font-size:17px;margin:0 0 10px}h2 span{font-weight:400;color:#aeb8ca;font-size:13px}.row{display:grid;grid-template-columns:repeat(3,1fr);gap:16px}.shot{border:1px solid #364151;border-radius:13px;overflow:hidden;background:#202733}.label{padding:8px 12px;font-size:13px;font-weight:600}.shot img{display:block;width:100%;height:auto}.swatches{display:grid;grid-template-columns:repeat(9,1fr);gap:9px;margin-top:13px}.swatch{height:59px;border:1px solid #647185;border-radius:8px;padding:10px;font-size:12px}.swatch small{display:block;margin-top:7px;color:#c5ccda;font-size:9px}.note{margin-top:12px;font-size:12px;color:#aeb8ca}</style></head><body><h1>Arc Side of the Chrome · Space palette proposals</h1><p>Same sidebar layout · 1px Favorite borders · brighter Favorite surfaces · no color bars under Space icons</p>${['A','B'].map(v=>`<section class="section"><h2>${v==='A'?'A · Distinct, balanced':'B · Vivid gradients'} <span>${v==='A'?'Recommended · calmer backdrop, clear separation':'Stronger colors and brighter Favorite buttons'}</span></h2><div class="row">${shots.filter(s=>s.variant===v).map(s=>`<div class="shot"><div class="label">${s.p.name} · ${s.p.colors.join(' → ')}</div><img src="data:image/png;base64,${s.image}"></div>`).join('')}</div></section>`).join('')}<section class="section"><h2>Proposed preset family <span>Background tones shown for A</span></h2><div class="swatches">${palettes.map(p=>`<div class="swatch" style="background:${gradient(p,.40)}">${p.name}<small>${p.colors.join(' / ')}</small></div>`).join('')}</div><div class="note">Preview only. Icon fixtures are illustrative; production favicon handling and tab controls stay unchanged.</div></section></body></html>`);
 await board.locator('img').last().waitFor();await board.evaluate(()=>Promise.all([...document.images].map(i=>i.decode())));
 const png=await board.screenshot({fullPage:true});await writeFile('/tmp/arc-palette-proposals.png',png);console.log('PALETTE_PROPOSALS_PNG='+png.toString('base64'));
 console.log('PASS: six actual extension sidebar previews rendered; production sources unchanged.');
}finally{await context.close();}
