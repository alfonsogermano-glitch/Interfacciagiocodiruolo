import test from 'node:test';
import assert from 'node:assert/strict';
import {once} from 'node:events';
import {createApp} from '../src/app.mjs';
import {createAuthHttpHandler} from '../src/auth-http.mjs';
const origin='https://staging.hollowgate.quest';
const player='4a3465ec-47d7-4021-9f0d-e70da8cbd002';
const character='d2344aae-20d0-4395-8039-49d0aa3657f9';
const campaign='f24f6bdd-a5f7-4521-aa16-bc0854dc5841';
const cookie={cookie:'__Host-hg_session='+'A'.repeat(43)};
const campaigns={list:async()=>({campaigns:[]}),create:async()=>{},update:async()=>{}};
const characters={list:async()=>({characters:[]}),create:async()=>{},save:async()=>{},archive:async()=>{}};
const campaignRoster={list:async()=>({members:[]})};
const characterAvailability={list:async()=>({characters:[]}),set:async()=>({})};
const characterAssignments={list:async()=>({assignments:[]}),set:async()=>({})};
const playerCharacters={list:async()=>({characters:[]}),listCampaigns:async()=>({campaigns:[]})};
async function serve(handler,fn){const server=createApp({checkDatabase:async()=>{},authHandler:handler});server.listen(0,'127.0.0.1');await once(server,'listening');try{await fn('http://127.0.0.1:'+server.address().port);}finally{await new Promise(resolve=>server.close(resolve));}}
const configured=logicalCharacters=>createAuthHttpHandler({origin,login:async()=>{},getSessionUser:async()=>({id:player}),revokeSession:async()=>{},campaigns,characters,campaignRoster,characterAvailability,characterAssignments,playerCharacters,logicalCharacters});

test('logical character routes and capability remain absent by default',async()=>{
 await serve(configured(null),async base=>{
  assert.equal((await fetch(base+'/vtt/characters',{headers:cookie})).status,404);
  assert.equal((await fetch(`${base}/vtt/characters/${character}/campaign`,{method:'PATCH',headers:{...cookie,origin}})).status,404);
 });
});

test('logical character listing and assignment use cookie identity only',async()=>{
 const calls=[];
 const logicalCharacters={list:async(...args)=>{calls.push(['list',...args]);return {characters:[],nextCursor:null};},assign:async(...args)=>{calls.push(['assign',...args]);return {characterId:args[1],assignment:{outcome:'detached',campaignId:null,ruleset:null}};}};
 await serve(configured(logicalCharacters),async base=>{
  const list=base+'/vtt/characters';
  assert.equal((await fetch(list,{headers:cookie})).status,200);
  assert.equal((await fetch(list+'?after='+character,{headers:cookie})).status,200);
  assert.equal((await fetch(list+'?after=not-a-uuid',{headers:cookie})).status,400);
  assert.equal((await fetch(list+'?after='+character+'&after='+character,{headers:cookie})).status,400);
   assert.equal((await fetch(list+'?unknown=1',{headers:cookie})).status,400);
   // Enabling global logical ownership must not shadow existing campaign reads.
   assert.equal((await fetch(list+'?campaignId='+campaign,{headers:cookie})).status,200);
   assert.equal((await fetch(list+'?campaignId='+campaign+'&after='+character,{headers:cookie})).status,400);
   assert.equal((await fetch(list+'?campaignId='+campaign+'&campaignId='+campaign,{headers:cookie})).status,400);
  const assign=`${base}/vtt/characters/${character}/campaign`;
  assert.equal((await fetch(assign,{method:'PATCH',headers:{...cookie,origin,'content-type':'application/json'},body:JSON.stringify({campaignId:campaign})})).status,200);
  assert.equal((await fetch(assign,{method:'PATCH',headers:{...cookie,origin,'content-type':'application/json'},body:JSON.stringify({campaignId:null})})).status,200);
  assert.equal((await fetch(assign,{method:'PATCH',headers:{...cookie,origin,'content-type':'application/json'},body:JSON.stringify({characterId:character})})).status,400);
  assert.equal((await fetch(assign,{method:'PATCH',headers:{...cookie,origin,'content-type':'application/json'},body:JSON.stringify({})})).status,400);
  assert.equal((await fetch(assign,{method:'PATCH',headers:{...cookie,origin,'content-type':'application/json'},body:JSON.stringify({campaignId:character})})).status,200);
  assert.deepEqual(calls.map(call=>call[0]),['list','list','assign','assign','assign']);
 });
});
