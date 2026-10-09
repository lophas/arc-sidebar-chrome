import test from 'node:test';
import assert from 'node:assert/strict';
import { faviconSource } from '../src/shared/favicon.js';
test('LAN HTTP favicons use Chrome cache without HTTPS upgrade; HTTPS and data icons remain available',()=>{
 globalThis.chrome={runtime:{id:'test'}};
 const source=faviconSource('http://haosvm.home.arpa:8123/','http://haosvm.home.arpa:8123/static/icons/favicon.ico');
 assert.ok(source.startsWith('chrome-extension://test/_favicon/'));
 assert.equal(new URL(source).searchParams.get('pageUrl'),'http://haosvm.home.arpa:8123/');
 assert.equal(faviconSource('https://example.test','https://example.test/icon.ico'),'https://example.test/icon.ico');
 assert.equal(faviconSource('https://example.test','data:image/png;base64,AA'),'data:image/png;base64,AA');
 delete globalThis.chrome;
});
