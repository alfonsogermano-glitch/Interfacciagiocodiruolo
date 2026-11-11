import test from 'node:test';
import assert from 'node:assert/strict';
import { createSignalingHub } from './signaling-hub.mjs';
test('dedicated localhost port can be configured explicitly',async t=>{
 const hub=createSignalingHub({port:0,hostname:'127.0.0.1'});
 const url=await hub.start();t.after(()=>hub.close());
 assert.match(url,/^http:\/\/127\.0\.0\.1:\d+$/);
 const res=await fetch(url+'/v1/create',{method:'POST',headers:{'content-type':'application/json'},body:'{}'});
 assert.equal(res.status,201);
});
test('refuses public binding',()=>{
 assert.throws(()=>createSignalingHub({hostname:'0.0.0.0'}),/loopback/i);
});
