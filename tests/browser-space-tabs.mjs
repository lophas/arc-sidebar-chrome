import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { resolve, extname } from 'node:path';
import { chromium } from 'playwright-core';
const root=process.cwd();
let html=await readFile('src/sidepanel/index.html','utf8');
html=html.replace(/<script[^>]*>[\s\S]*?<\/script>/g,'').replace('</body>',`<script src="/tests/fixtures/space-tabs-chrome.js"></script><script type="module" src="index.js"></script><script type="module" src="open-pin.js"></script></body>`);
const server=createServer(async(req,res)=>{
 const pathname=new URL(req.url,'http://localhost').pathname;
 if(pathname==='/src/sidepanel/index.html'){res.setHeader('Content-Type','text/html');res.end(html);return;}
 const file=resolve(root,'.'+pathname);
 if(!file.startsWith(root+'/')){res.writeHead(403);res.end();return;}
 try{res.setHeader('Content-Type',extname(file)==='.js'?'text/javascript':extname(file)==='.css'?'text/css':'application/octet-stream');res.end(await readFile(file));}catch{res.writeHead(404);res.end();}
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const browser=await chromium.launch({executablePath:process.argv[2]||'/usr/bin/google-chrome',headless:true,args:['--no-sandbox']});
try{
 const page=await browser.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto(`http://127.0.0.1:${server.address().port}/src/sidepanel/index.html`);
 const ids=()=>page.locator('#openTabs .row').evaluateAll(rows=>rows.map(row=>Number(row.dataset.liveTabId)));
 await page.waitForFunction(()=>document.querySelectorAll('#openTabs .row').length===3);
 assert.deepEqual(await ids(),[11,12,21]);assert.equal(await page.locator('.other-window-label').textContent(),'Other window');
 await page.locator('[data-live-tab-id="12"]').click();
 assert.equal(await page.evaluate(()=>fixture.calls.findLast(c=>c.type==='arc-sidebar-tab-action')?.tabId),12);
 await page.waitForFunction(()=>document.querySelector('[data-live-tab-id="12"]')?.dataset.openPinManaged==='1');
 await page.locator('[data-live-tab-id="12"]').click({button:'right'});
 assert.equal(await page.locator('#openPinUrl').inputValue(),'https://12.test');
 await page.locator('#openPinSave').click();
 await page.waitForFunction(()=>!document.querySelector('[data-live-tab-id="12"]'));
 assert.deepEqual(await ids(),[11,21]);
 await page.locator('[data-live-tab-id="11"] .close-tab').click();
 await page.waitForFunction(()=>!document.querySelector('[data-live-tab-id="11"]'));
 await page.evaluate(()=>{fixture.tabs.find(t=>t.id===21).groupId=5;chrome.tabs.onUpdated.emit(21,{groupId:5});});
 await page.waitForFunction(()=>document.querySelector('#openSection').classList.contains('hidden'));
 await page.locator('[data-space-id="other"]').click();
 await page.waitForFunction(()=>document.querySelectorAll('#openTabs .row').length===2);
 assert.deepEqual(await ids(),[30,21]);
 await page.locator('[data-space-id="__open_tabs__"]').click();
 await page.waitForFunction(()=>document.querySelectorAll('#openTabs .row').length===4);
 assert.deepEqual(errors,[]);console.log('PASS real Chrome: Space workflow rendering, pin/activate/close, group changes and Open-tabs view');
}finally{await browser.close();await new Promise(resolve=>server.close(resolve));}
