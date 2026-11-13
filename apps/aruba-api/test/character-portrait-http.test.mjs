import test from 'node:test';
import assert from 'node:assert/strict';
import {once} from 'node:events';
import {createApp} from '../src/app.mjs';
import {createAuthHttpHandler} from '../src/auth-http.mjs';
const origin='https://staging.hollowgate.quest';
const owner='971e26ae-eecb-4f37-ad03-56b0c3000789';
const camp='be2f1a87-b8ee-4b34-9da0-07efda11379a';
const character='ee2f1a87-b8ee-4b34-9da0-07efda11379a';
const cookie={cookie:'__Host-hg_session='+'A'.repeat(43)};
const campaigns={list:async()=>({campaigns:[]}),create:async()=>{},update:async()=>{}};
const characters={list:async()=>({characters:[]}),create:async()=>{},save:async()=>{},archive:async()=>{}};
async function serve(portraits,fn){
 const auth=createAuthHttpHandler({origin,login:async()=>{},getSessionUser:async()=>({id:owner}),revokeSession:async()=>{},
 campaigns,characters,characterPortraits:portraits});
 const app=createApp({checkDatabase:async()=>{},authHandler:auth});
 app.listen(0,'127.0.0.1');await once(app,'listening');
 try{await fn('http://127.0.0.1:'+app.address().port);}
 finally{await new Promise(resolve=>app.close(resolve));}
}
test('portrait endpoints are disabled by default and demand owner cookie and origin',async()=>{
 const called=[];
 await serve({save:async(...args)=>{called.push(['save',...args]);return {stored:true}},
  read:async(...args)=>{called.push(['read',...args]);return {mimeType:'image/png',dataBase64:''}}},
 async base=>{
  const url=base+'/vtt/character-portrait/'+character+'?campaignId='+camp;
  assert.equal((await fetch(url)).status,401);
  assert.equal((await fetch(url,{headers:cookie})).status,200);
  assert.equal((await fetch(url+'&ownerId=forged',{headers:cookie})).status,400);
  const json={campaignId:camp,mimeType:'image/png',dataBase64:'AA=='};
  const req={method:'PUT',headers:{...cookie,origin,'content-type':'application/json'},body:JSON.stringify(json)};
  assert.equal((await fetch(url,{...req,headers:{...cookie,'content-type':'application/json'}})).status,403);
  assert.equal((await fetch(url,req)).status,200);
  assert.deepEqual(called.map(x=>x.slice(0,4)),[['read',owner,camp,character],['save',owner,camp,character]]);
 });
 await serve(null,async base=>{
  assert.equal((await fetch(base+'/vtt/character-portrait/'+character+'?campaignId='+camp,{headers:cookie})).status,404);
  const caps=await (await fetch(base+'/vtt/bootstrap',{headers:cookie})).json();
  assert.deepEqual(caps.capabilities.characterPortraits,{read:false,write:false});
 });
});
