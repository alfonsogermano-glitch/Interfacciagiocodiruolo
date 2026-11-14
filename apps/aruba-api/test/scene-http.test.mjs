import test from 'node:test';
import assert from 'node:assert/strict';
import {once} from 'node:events';
import {createApp} from '../src/app.mjs';
import {createAuthHttpHandler} from '../src/auth-http.mjs';
const origin='https://staging.hollowgate.quest';
const token='A'.repeat(43);
const owner='971e26ae-eecb-4f37-ad03-56b0c3000789';
const campaign='be2f1a87-b8ee-4b34-9da0-07efda11379a';
const scene='4b2c4c0b-4b67-45c2-901a-2b4d3f7c8c42';
const url='/vtt/campaigns/'+campaign+'/scenes';
async function serve(enabled,callback){
 const calls=[];
 const scenes=enabled?{
  list:async(...args)=>{calls.push(['list',...args]);return {scenes:[]};},
  save:async(...args)=>{calls.push(['save',...args]);return {scene:args[2]};},
  remove:async(...args)=>{calls.push(['remove',...args]);return {deleted:true};}
 }:null;
 const handler=createAuthHttpHandler({
  origin,login:async()=>{},revokeSession:async()=>{},
  getSessionUser:async value=>value===token?{id:owner}:null,
  campaigns:{list:async()=>({campaigns:[]}),create:async()=>({}),update:async()=>({})},
  chapters:{list:async()=>({chapters:[]}),save:async()=>({}),remove:async()=>({})},
  scenes
 });
 const server=createApp({checkDatabase:async()=>{},authHandler:handler});
 server.listen(0,'127.0.0.1');await once(server,'listening');
 try{await callback('http://127.0.0.1:'+server.address().port,calls);}
 finally{await new Promise(resolve=>server.close(resolve));}
}
test('Scene HTTP stays disabled without explicit staging opt-in',async()=>{
 await serve(false,async base=>{
  assert.equal((await fetch(base+url,{headers:{cookie:'__Host-hg_session='+token}})).status,404);
 });
});
test('Scene HTTP reads session owner and enforces same-origin writes',async()=>{
 await serve(true,async(base,calls)=>{
  const cookie={cookie:'__Host-hg_session='+token};
  assert.equal((await fetch(base+url)).status,401);
  assert.equal((await fetch(base+url,{headers:cookie})).status,200);
  assert.deepEqual(calls,[['list',owner,campaign]]);
  const body={id:scene,chapterId:scene,title:'Scene'};
  const opts={method:'PUT',headers:{...cookie,origin,'content-type':'application/json'},body:JSON.stringify(body)};
  assert.equal((await fetch(base+url,{...opts,headers:{...opts.headers,origin:'https://evil.invalid'}})).status,403);
  assert.equal((await fetch(base+url,opts)).status,200);
  assert.deepEqual(calls[1],['save',owner,campaign,body]);
  assert.equal((await fetch(base+url+'/'+scene,{method:'DELETE',headers:{...cookie,origin}})).status,200);
  assert.deepEqual(calls[2],['remove',owner,campaign,scene]);
 });
});
test('Scene HTTP rejects unsupported methods and malformed paths',async()=>{
 await serve(true,async base=>{
  const headers={cookie:'__Host-hg_session='+token};
  assert.equal((await fetch(base+url,{method:'POST',headers})).status,405);
  assert.equal((await fetch(base+url+'/'+scene,{headers})).status,405);
  assert.equal((await fetch(base+url,{method:'DELETE',headers})).status,405);
  assert.equal((await fetch(base+url+'/'+scene,{method:'PUT',headers})).status,405);
  assert.equal((await fetch(base+url+'/invalid',{headers})).status,400);
 });
});
test('Scene routes require an installed Chapter service',()=>{
 assert.throws(()=>createAuthHttpHandler({
  origin,login:async()=>{},revokeSession:async()=>{},getSessionUser:async()=>null,
  scenes:{list:async()=>{},save:async()=>{},remove:async()=>{}}
 }),/Scene endpoints require chapters/);
});

test('Scene writes reject missing Origin, missing cookie and unsupported JSON',async()=>{
 await serve(true,async(base,calls)=>{
  const cookie={cookie:'__Host-hg_session='+token};
  const body=JSON.stringify({id:scene,chapterId:scene,title:'Scene'});
  assert.equal((await fetch(base+url,{method:'PUT',headers:{...cookie,'content-type':'application/json'},body})).status,403);
  assert.equal((await fetch(base+url,{method:'PUT',headers:{origin,'content-type':'application/json'},body})).status,401);
  assert.equal((await fetch(base+url,{method:'PUT',headers:{...cookie,origin,'content-type':'text/plain'},body})).status,415);
  assert.equal((await fetch(base+url+'/'+scene,{method:'DELETE',headers:cookie})).status,403);
  assert.equal((await fetch(base+url+'/'+scene,{method:'DELETE',headers:{origin}})).status,401);
  assert.deepEqual(calls,[]);
 });
});
