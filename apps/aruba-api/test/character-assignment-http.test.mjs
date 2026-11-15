import test from 'node:test';
import assert from 'node:assert/strict';
import {once} from 'node:events';
import {createApp} from '../src/app.mjs';
import {createAuthHttpHandler} from '../src/auth-http.mjs';
const origin='https://staging.hollowgate.quest';
const owner='971e26ae-eecb-4f37-ad03-56b0c3000789';
const campaign='be2f1a87-b8ee-4b34-9da0-07efda11379a';
const character='ee2f1a87-b8ee-4b34-9da0-07efda11379a';
const player='b74bde1c-1075-4f86-b825-72e9616ebc78';
const cookie={cookie:'__Host-hg_session='+'A'.repeat(43)};
const campaigns={list:async()=>({campaigns:[]}),create:async()=>{},update:async()=>{}};
const characters={list:async()=>({characters:[]}),create:async()=>{},save:async()=>{},archive:async()=>{}};
const campaignRoster={list:async()=>({members:[]})};
const characterAvailability={list:async()=>({characters:[]}),set:async()=>({})};
async function serve(handler,fn){
 const server=createApp({checkDatabase:async()=>{},authHandler:handler});
 server.listen(0,'127.0.0.1');await once(server,'listening');
 try{await fn('http://127.0.0.1:'+server.address().port);}
 finally{await new Promise(resolve=>server.close(resolve));}
}
const configured=(assignments)=>createAuthHttpHandler({
 origin,login:async()=>{},getSessionUser:async()=>({id:owner}),
 revokeSession:async()=>{},campaigns,characters,campaignRoster,characterAvailability,
 characterAssignments:assignments,
});
test('assignment routes are unavailable by default and bootstrap is explicit',async()=>{
 await serve(configured(null),async base=>{
  assert.equal((await fetch(base+'/vtt/character-assignments?campaignId='+campaign,{headers:cookie})).status,404);
  const c=(await (await fetch(base+'/vtt/bootstrap',{headers:cookie})).json()).capabilities;
  assert.deepEqual(c.characterAssignments,{read:false,write:false});
 });
 assert.throws(()=>createAuthHttpHandler({origin,login:async()=>{},getSessionUser:async()=>null,
  revokeSession:async()=>{},characters,campaigns,characterAssignments:{list:async()=>{},set:async()=>{}}}),/require/);
});
test('GET and PATCH only use session identity, exact body and CSRF',async()=>{
 const calls=[];
 const assignments={
  list:async(...args)=>{calls.push(['list',...args]);return {assignments:[]};},
  set:async(...args)=>{calls.push(['set',...args]);return {characterId:args[2],playerId:args[3]};},
 };
 await serve(configured(assignments),async base=>{
  const list=base+'/vtt/character-assignments?campaignId='+campaign;
  assert.equal((await fetch(list)).status,401);
  assert.equal((await fetch(list,{headers:cookie})).status,200);
  assert.equal((await fetch(list+'&ownerId='+owner,{headers:cookie})).status,400);
  const url=base+'/vtt/character-assignments/'+character;
  const options={method:'PATCH',headers:{...cookie,origin,'content-type':'application/json'},
   body:JSON.stringify({campaignId:campaign,playerId:player})};
  assert.equal((await fetch(url,{...options,headers:{origin,'content-type':'application/json'}})).status,401);
  assert.equal((await fetch(url,{...options,headers:{...cookie,origin:'https://evil.example','content-type':'application/json'}})).status,403);
  assert.equal((await fetch(url,{...options,body:JSON.stringify({campaignId:campaign,playerId:player,ownerId:owner})})).status,400);
  assert.equal((await fetch(url,options)).status,200);
  assert.equal((await fetch(url,{...options,body:JSON.stringify({campaignId:campaign,playerId:null})})).status,200);
  assert.deepEqual(calls,[['list',owner,campaign],
   ['set',owner,campaign,character,player],['set',owner,campaign,character,null]]);
 });
});
