import test from 'node:test';
import assert from 'node:assert/strict';
import {once} from 'node:events';
import {createApp} from '../src/app.mjs';
import {createAuthHttpHandler} from '../src/auth-http.mjs';
const origin='https://staging.hollowgate.quest';
const token='A'.repeat(43);
const owner='971e26ae-eecb-4f37-ad03-56b0c3000789';
const campaign='be2f1a87-b8ee-4b34-9da0-07efda11379a';
const chapter='4b2c4c0b-4b67-45c2-901a-2b4d3f7c8c42';
const url='/vtt/campaigns/'+campaign+'/chapters';
async function serve(chapters,callback){
 const calls=[];
 const handler=createAuthHttpHandler({
  origin,login:async()=>{},revokeSession:async()=>{},
  getSessionUser:async value=>value===token?{id:owner}:null,
  campaigns:{list:async()=>({campaigns:[]}),create:async()=>({}),update:async()=>({})},
  chapters:chapters&&{
   list:async(...args)=>{calls.push(['list',...args]);return {chapters:[]};},
   save:async(...args)=>{calls.push(['save',...args]);return {chapter:args[2]};},
   remove:async(...args)=>{calls.push(['remove',...args]);return {deleted:true};},
  },
 });
 const server=createApp({checkDatabase:async()=>{},authHandler:handler});
 server.listen(0,'127.0.0.1');await once(server,'listening');
 try{await callback('http://127.0.0.1:'+server.address().port,calls);}
 finally{await new Promise(resolve=>server.close(resolve));}
}
test('chapters remain 404 when staging feature is disabled',async()=>{
 await serve(false,async base=>{
  assert.equal((await fetch(base+url,{headers:{cookie:'__Host-hg_session='+token}})).status,404);
 });
});
test('chapter HTTP uses cookie identity and same-origin writes',async()=>{
 await serve(true,async(base,calls)=>{
  const cookie={cookie:'__Host-hg_session='+token};
  assert.equal((await fetch(base+url)).status,401);
  assert.equal((await fetch(base+url,{headers:cookie})).status,200);
  assert.deepEqual(calls,[['list',owner,campaign]]);
  const body={id:chapter,title:'Intro'};
  const opts={method:'PUT',headers:{...cookie,origin,'content-type':'application/json'},body:JSON.stringify(body)};
  assert.equal((await fetch(base+url,{...opts,headers:{...opts.headers,origin:'https://evil.invalid'}})).status,403);
  assert.equal((await fetch(base+url,opts)).status,200);
  assert.deepEqual(calls[1],['save',owner,campaign,body]);
  assert.equal((await fetch(base+url+'/'+chapter,{method:'DELETE',headers:{...cookie,origin}})).status,200);
  assert.deepEqual(calls[2],['remove',owner,campaign,chapter]);
 });
});
test('chapter HTTP rejects wrong methods and invalid routes',async()=>{
 await serve(true,async base=>{
  const cookie={cookie:'__Host-hg_session='+token};
  assert.equal((await fetch(base+url,{method:'POST',headers:cookie})).status,405);
  assert.equal((await fetch(base+url+'/'+chapter,{headers:cookie})).status,405);
  assert.equal((await fetch(base+url,{method:'DELETE',headers:cookie})).status,405);
 });
});
