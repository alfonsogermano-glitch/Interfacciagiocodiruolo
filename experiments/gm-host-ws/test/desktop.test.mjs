import test from 'node:test';
import assert from 'node:assert/strict';
import {createTunnelUrlScanner} from '../desktop/tunnel-output.mjs';
import {isLocalGmOrigin} from '../desktop/local-origin.mjs';
test('Streaming Cloudflare URL detected only once',()=>{
 const found=[];const scan=createTunnelUrlScanner(url=>found.push(url));
 scan('INF created at https://little-');scan('forest.trycloudflare.com\nINF https://little-forest.trycloudflare.com');
 assert.deepEqual(found,['https://little-forest.trycloudflare.com']);
});
test('Public tunnel origin cannot claim GM local privileges',()=>{
 assert.equal(isLocalGmOrigin('127.0.0.1:4177','http://127.0.0.1:4177'),true);
 assert.equal(isLocalGmOrigin('localhost:4177','http://localhost:4177'),true);
 assert.equal(isLocalGmOrigin('my.trycloudflare.com','https://my.trycloudflare.com'),false);
 assert.equal(isLocalGmOrigin('127.0.0.1:4177','https://evil.example'),false);
});
