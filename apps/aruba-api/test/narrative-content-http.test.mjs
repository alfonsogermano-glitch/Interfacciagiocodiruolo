import test from 'node:test';
import assert from 'node:assert/strict';
import {once} from 'node:events';
import {createApp} from '../src/app.mjs';
import {createAuthHttpHandler} from '../src/auth-http.mjs';
const origin='https://staging.hollowgate.quest',token='A'.repeat(43);
const owner='971e26ae-eecb-4f37-ad03-56b0c3000789',campaign='be2f1a87-b8ee-4b34-9da0-07efda11379a',item='4b2c4c0b-4b67-45c2-901a-2b4d3f7c8c42';
async function serve(enabled,callback){
 const calls=[],service=enabled?{
  list:async(...args)=>{calls.push(['list',...args]);return {items:[]};},
  save:async(...args)=>{calls.push(['save',...args]);return {item:args[3]};},
  remove:async(...args)=>{calls.push(['remove',...args]);return {deleted:true};},
 }:null;
 const baseService={list:async()=>({}),save:async()=>({}),remove:async()=>({})};
 const handler=createAuthHttpHandler({origin,login:async()=>{},revokeSession:async()=>{},getSessionUser:async value=>value===token?{id:owner}:null,
  campaigns:{list:async()=>({campaigns:[]}),create:async()=>({}),update:async()=>({})},chapters:baseService,scenes:baseService,narrativeContent:service});
 const server=createApp({checkDatabase:async()=>{},authHandler:handler});server.listen(0,'127.0.0.1');await once(server,'listening');
 try{await callback('http://127.0.0.1:'+server.address().port,calls);}finally{await new Promise(resolve=>server.close(resolve));}
}
test('narrative routes are cookie-derived, same-origin and kind-scoped',async()=>{
 await serve(true,async(base,calls)=>{
  const url=base+`/vtt/campaigns/${campaign}/narrative/clues`,cookie={cookie:'__Host-hg_session='+token};
  assert.equal((await fetch(url)).status,401);assert.equal((await fetch(url,{headers:cookie})).status,200);
  const body={id:item,title:'Sigillo'};
  assert.equal((await fetch(url,{method:'PUT',headers:{...cookie,origin:'https://evil.invalid','content-type':'application/json'},body:JSON.stringify(body)})).status,403);
  assert.equal((await fetch(url,{method:'PUT',headers:{...cookie,origin,'content-type':'application/json'},body:JSON.stringify(body)})).status,200);
  assert.equal((await fetch(url+'/'+item,{method:'DELETE',headers:{...cookie,origin}})).status,200);
  assert.deepEqual(calls,[['list',owner,campaign,'clues'],['save',owner,campaign,'clues',body],['remove',owner,campaign,'clues',item]]);
 });
});
test('narrative routes stay unavailable without explicit feature service',async()=>{
 await serve(false,async base=>assert.equal((await fetch(base+`/vtt/campaigns/${campaign}/narrative/npcs`,{headers:{cookie:'__Host-hg_session='+token}})).status,404));
});
