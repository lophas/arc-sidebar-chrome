import {createServer} from 'node:http';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {resolve,extname} from 'node:path';
import {chromium} from 'playwright-core';
const root=process.cwd();
const sites={gmail:'mail.google.com',github:'github.com',calendar:'calendar.google.com',notion:'notion.so',docs:'docs.google.com',figma:'figma.com',linear:'linear.app',mdn:'developer.mozilla.org',drive:'drive.google.com'};
const icons=new Map();
for(const domain of Object.values(sites)) {
 try {const r=await fetch(`https://www.google.com/s2/favicons?domain=${domain}&sz=64`,{signal:AbortSignal.timeout(10000)});if(r.ok)icons.set(domain,Buffer.from(await r.arrayBuffer()));}catch{}
}
const seed=`
const link=(id,title,url)=>({id,type:'tab',title,url});
fixture.data.local.arcSidebarModel={favorites:[link('gmail','Gmail','https://mail.google.com'),link('github','GitHub','https://github.com'),link('calendar','Google Calendar','https://calendar.google.com'),link('notion','Notion','https://notion.so')],spaces:[{id:'work',title:'Work',emoji:'💼',children:[link('dashboard','Project dashboard','https://linear.app'),{id:'project',type:'folder',title:'Website redesign',children:[link('brief','Project brief','https://docs.google.com'),link('design','Design files','https://figma.com'),link('repo','Source code','https://github.com/lophas/arc-sidebar-chrome')]},{id:'resources',type:'folder',title:'Resources',children:[link('mdn','MDN Web Docs','https://developer.mozilla.org'),link('drive','Shared files','https://drive.google.com')]}]},{id:'personal',title:'Personal',emoji:'🏡',children:[]},{id:'reading',title:'Reading',emoji:'📚',children:[]}],stats:{spaces:3,folders:2,tabs:6,favorites:4}};
fixture.data.local.arcSidebarState={currentSpaceId:'work',collapsedFolders:{resources:true}};
fixture.tabs.splice(0);
fixture.data.session.arcSidebarBindings={};
let index=0;
for(const item of [...fixture.data.local.arcSidebarModel.favorites,...fixture.data.local.arcSidebarModel.spaces[0].children.flatMap(n=>n.type==='folder'?n.children:[n])]) {
 const id=100+index;fixture.data.session.arcSidebarBindings[item.id]=id;
 fixture.tabs.push({id,windowId:1,index:index++,groupId:fixture.data.local.arcSidebarModel.favorites.includes(item)?6:2,url:item.url,title:item.title,active:item.id==='brief',lastAccessed:1000-index,favIconUrl:location.origin+'/_favicon/?pageUrl='+encodeURIComponent(item.url)});
}
fixture.tabs.push({id:201,windowId:1,index:index++,groupId:2,title:'CSS grid layout — MDN',url:'https://developer.mozilla.org/en-US/docs/Web/CSS/CSS_grid_layout',lastAccessed:2000,favIconUrl:location.origin+'/_favicon/?pageUrl=https://developer.mozilla.org'});
fixture.tabs.push({id:202,windowId:1,index:index++,groupId:2,title:'Pull requests · arc-sidebar-chrome',url:'https://github.com/lophas/arc-sidebar-chrome/pulls',lastAccessed:1900,favIconUrl:location.origin+'/_favicon/?pageUrl=https://github.com'});
fixture.tabs.push({id:203,windowId:2,index:0,groupId:3,title:'Team planning',url:'https://docs.google.com/planning',lastAccessed:1800,favIconUrl:location.origin+'/_favicon/?pageUrl=https://docs.google.com'});
fixture.data.session.arcSidebarNativeGroups={'1:work':2,'2:work':3,'1:__favorites__':6};
`;
const fixture=await readFile('tests/fixtures/space-tabs-chrome.js','utf8');
const scripts=['theme-sync.js','index.js','favorite-size.js','folder-manage.js','command-bar.js'];
const sidebar=(await readFile('src/sidepanel/index.html','utf8')).replace(/<script[^>]*>[\s\S]*?<\/script>/g,'').replace('</body>',`<script src="/demo.js"></script>${scripts.map(s=>`<script ${s==='theme-sync.js'?'':'type="module"'} src="${s}"></script>`).join('')}</body>`);
const command=(await readFile('src/sidepanel/command.html','utf8')).replace('<script type="module"', '<script src="/demo.js"></script><script src="theme-sync.js"></script><script type="module"');
const server=createServer(async(req,res)=>{
 const u=new URL(req.url,'http://localhost');
 if(u.pathname==='/demo.js'){res.setHeader('Content-Type','text/javascript');res.end(fixture+'\n'+seed);return;}
 if(u.pathname==='/_favicon/') {let domain;try{domain=new URL(u.searchParams.get('pageUrl')).hostname;}catch{}const icon=icons.get(domain);if(icon){res.setHeader('Content-Type','image/png');res.end(icon);}else{res.writeHead(404);res.end();}return;}
 if(u.pathname==='/src/sidepanel/index.html'||u.pathname==='/src/sidepanel/command.html'){res.setHeader('Content-Type','text/html');res.end(u.pathname.endsWith('/command.html')?command:sidebar);return;}
 const file=resolve(root,'.'+u.pathname);if(!file.startsWith(root+'/')){res.writeHead(403);res.end();return;}
 try{res.setHeader('Content-Type',extname(file)==='.js'?'text/javascript':extname(file)==='.css'?'text/css':'application/octet-stream');res.end(await readFile(file));}catch{res.writeHead(404);res.end();}
});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
const browser=await chromium.launch({executablePath:'/usr/bin/google-chrome',headless:true,args:['--no-sandbox']});
try {
 await mkdir('docs/screenshots/generated',{recursive:true});
 const page=await browser.newPage({viewport:{width:420,height:820},deviceScaleFactor:2,colorScheme:'dark'});
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 const base=`http://127.0.0.1:${server.address().port}`;
 await page.goto(base+'/src/sidepanel/index.html');
 await page.waitForFunction(()=>document.querySelectorAll('#openTabs .row').length===3);
 await page.waitForTimeout(1500);
 await page.screenshot({path:'docs/screenshots/generated/sidebar.png'});
 await page.locator('#openCommandBar').click();
 await page.locator('.command-input').fill('project');
 await page.waitForTimeout(500);
 await page.screenshot({path:'docs/screenshots/generated/sidebar-search.png'});
 await page.keyboard.press('Escape');
 await page.setViewportSize({width:760,height:560});
 await page.goto(base+'/src/sidepanel/command.html?windowId=1');
 await page.waitForSelector('.command-dialog[open]');
 await page.waitForTimeout(1000);
 await page.screenshot({path:'docs/screenshots/generated/search-popup.png'});
 if(errors.length)throw Error(errors.join('\n'));
 console.log('Captured three screenshots of the actual sidebar and command bar with example workspace data.');
}finally{await browser.close();await new Promise(r=>server.close(r));}
