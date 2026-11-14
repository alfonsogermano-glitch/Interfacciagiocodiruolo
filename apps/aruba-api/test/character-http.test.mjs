import test from 'node:test';
import assert from 'node:assert/strict';
import {once} from 'node:events';
import {createApp} from '../src/app.mjs';
import {createAuthHttpHandler} from '../src/auth-http.mjs';
const origin='https://staging.hollowgate.quest';
const owner='971e26ae-eecb-4f37-ad03-56b0c3000789';
const campaign='be2f1a87-b8ee-4b34-9da0-07efda11379a';
const cookie={cookie:'__Host-hg_session='+'A'.repeat(43)};
const campaigns={list:async()=>({campaigns:[]}),create:async()=>{},update:async()=>{}};
async function withServer(handler,fn){
 const server=createApp({checkDatabase:async()=>{},authHandler:handler});server.listen(0,'127.0.0.1');
 await once(server,'listening');
 try{await fn('http://127.0.0.1:'+server.address().port);}
 finally{await new Promise(resolve=>server.close(resolve));}
}
test('character endpoints are opt-in, scoped to cookie owner, and require CSRF origin',async()=>{
 const calls=[];
 const characters={
  list:async(...args)=>{calls.push(['list',...args]);return {characters:[]}},
  create:async(...args)=>{calls.push(['create',...args]);return {character:{name:'PG'}}},
  save:async(...args)=>{calls.push(['save',...args]);return {character:{name:'Ken'}}},
  archive:async(...args)=>{calls.push(['archive',...args]);return {archivedId:args[2]}},
 };
 const handler=createAuthHttpHandler({origin,login:async()=>{},getSessionUser:async t=>t?{id:owner}:null,revokeSession:async()=>{},campaigns,characters});
 await withServer(handler,async base=>{
  assert.equal((await fetch(base+'/vtt/characters?campaignId='+campaign)).status,401);
  assert.equal((await fetch(base+'/vtt/characters?campaignId='+campaign,{headers:cookie})).status,200);
  assert.equal((await fetch(base+'/vtt/characters?campaignId='+campaign+'&ownerId=other',{headers:cookie})).status,400);
  const url=base+'/vtt/characters';
  const request={method:'POST',headers:{...cookie,origin,'content-type':'application/json'},body:JSON.stringify({name:'PG',campaignId:campaign})};
  assert.equal((await fetch(url,{...request,headers:{...cookie,origin:'https://evil.invalid','content-type':'application/json'}})).status,403);
  assert.equal((await fetch(url,request)).status,201);
  assert.deepEqual(calls,[['list',owner,campaign],['create',owner,campaign,{name:'PG'}]]);
  assert.equal((await fetch(url,{...request,body:JSON.stringify({name:'PG',campaignId:campaign,ownerId:'forged'})})).status,400);
 });
 const off=createAuthHttpHandler({origin,login:async()=>{},getSessionUser:async()=>({id:owner}),revokeSession:async()=>{},campaigns});
 await withServer(off,async base=>{
  assert.equal((await fetch(base+'/vtt/characters?campaignId='+campaign,{headers:cookie})).status,404);
  assert.equal((await fetch(base+'/vtt/bootstrap',{headers:cookie}).then(r=>r.json())).capabilities.characters.read,false);
 });
});

test('original sheet PUT requires valid cookie, same-origin, and does not accept arbitrary IDs',async()=>{
 const calls=[];
 const characters={list:async()=>({characters:[]}),create:async()=>({character:{}}),
  save:async(...args)=>{calls.push(args);return {character:{name:'Ken'}}},
  archive:async()=>({archivedId:'ok'})};
 const handler=createAuthHttpHandler({origin,login:async()=>{},getSessionUser:async()=>({id:owner}),revokeSession:async()=>{},campaigns,characters});
 await withServer(handler,async base=>{
  const body={campaignId:campaign,name:'Ken',sheetData:{style:'Jock',viaggio:'Campione',ambiti:{},abilita:{},tratti:[],equipment:[]}};
  const url=base+'/vtt/characters/ee2f1a87-b8ee-4b34-9da0-07efda11379a';
  const req={method:'PUT',headers:{...cookie,origin,'content-type':'application/json'},body:JSON.stringify(body)};
  assert.equal((await fetch(url,{...req,headers:{origin,'content-type':'application/json'}})).status,401);
  assert.equal((await fetch(url,{...req,headers:{...cookie,origin:'https://evil.invalid','content-type':'application/json'}})).status,403);
  assert.equal((await fetch(url,req)).status,200);
  assert.deepEqual(calls[0],[owner,campaign,'ee2f1a87-b8ee-4b34-9da0-07efda11379a',body]);
  assert.equal((await fetch(base+'/vtt/characters/bad-id',req)).status,400);
 });
});

test('archive endpoint checks session and CSRF and cannot trust user-provided owner',async()=>{
 const calls=[];const characters={list:async()=>({characters:[]}),create:async()=>({character:{}}),
  save:async()=>({character:{}}),archive:async(...args)=>{calls.push(args);return {archivedId:args[2]}}};
 const handler=createAuthHttpHandler({origin,login:async()=>{},getSessionUser:async()=>({id:owner}),revokeSession:async()=>{},campaigns,characters});
 await withServer(handler,async base=>{
  const id='ee2f1a87-b8ee-4b34-9da0-07efda11379a';
  const url=base+'/vtt/characters/'+id;
  const req={method:'DELETE',headers:{...cookie,origin,'content-type':'application/json'},body:JSON.stringify({campaignId:campaign})};
  assert.equal((await fetch(url,{...req,headers:{origin,'content-type':'application/json'}})).status,401);
  assert.equal((await fetch(url,{...req,headers:{...cookie,origin:'https://evil.invalid','content-type':'application/json'}})).status,403);
  assert.equal((await fetch(url,{...req,body:JSON.stringify({campaignId:campaign,ownerId:'forged'})})).status,400);
  assert.equal((await fetch(url,req)).status,200);
  assert.deepEqual(calls,[[owner,campaign,id]]);
 });
});
