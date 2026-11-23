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
const configured=characterClaims=>createAuthHttpHandler({origin,login:async()=>{},getSessionUser:async()=>({id:player}),revokeSession:async()=>{},campaigns,characters,campaignRoster,characterAvailability,characterAssignments,playerCharacters,characterClaims});

test('claim routes and capability remain absent by default',async()=>{
 await serve(configured(null),async base=>{
  assert.equal((await fetch(`${base}/vtt/player-characters/${character}/claim`,{method:'POST',headers:{...cookie,origin}})).status,404);
  const capability=(await (await fetch(base+'/vtt/bootstrap',{headers:cookie})).json()).capabilities.characterClaims;
  assert.deepEqual(capability,{read:false,write:false});
 });
});

test('claim and release derive player from cookie and accept no client identity body',async()=>{
 const calls=[];const claims={list:async(...args)=>{calls.push(['list',...args]);return {characters:[]};},current:async(...args)=>{calls.push(['current',...args]);return {claim:{characterId:character,claimedAt:'2026-11-16T00:00:00.000Z'}};},owned:async(...args)=>{calls.push(['owned',...args]);return {claims:[]};},claim:async(...args)=>{calls.push(['claim',...args]);return {characterId:args[1],campaignId:campaign};},release:async(...args)=>{calls.push(['release',...args]);return {characterId:args[1]};},save:async(...args)=>{calls.push(['save',...args]);return {character:{id:character}};}};
 await serve(configured(claims),async base=>{
  const claim=`${base}/vtt/player-characters/${character}/claim`,release=`${base}/vtt/player-characters/${character}/release`;
  const list=`${base}/vtt/player-character-claims?campaignId=${campaign}`;
  const current=`${base}/vtt/player-character-claim?campaignId=${campaign}`;
  assert.equal((await fetch(list,{headers:cookie})).status,200);
  assert.equal((await fetch(list+'&playerId='+player,{headers:cookie})).status,400);
  assert.equal((await fetch(current,{headers:cookie})).status,200);
  assert.equal((await fetch(`${base}/vtt/owned-character-claims?campaignId=${campaign}`,{headers:cookie})).status,200);
  const sheet={campaignId:campaign,name:'PG',sheetData:{style:'Jock',viaggio:'',ambiti:{},abilita:{},tratti:[],equipment:[]}};
  assert.equal((await fetch(`${base}/vtt/player-characters/${character}`,{method:'PUT',headers:{...cookie,origin,'content-type':'application/json'},body:JSON.stringify(sheet)})).status,200);
  assert.equal((await fetch(claim,{method:'POST',headers:{origin}})).status,401);
  assert.equal((await fetch(claim,{method:'POST',headers:{...cookie,origin:'https://evil.invalid'}})).status,403);
  assert.equal((await fetch(claim,{method:'POST',headers:{...cookie,origin,'content-type':'application/json'},body:JSON.stringify({playerId:player,campaignId:campaign})})).status,400);
  assert.equal((await fetch(claim,{method:'POST',headers:{...cookie,origin}})).status,200);
  assert.equal((await fetch(release,{method:'POST',headers:{...cookie,origin}})).status,200);
  assert.deepEqual(calls,[['list',player,campaign],['current',player,campaign],['owned',player,campaign],['save',player,campaign,character,sheet],['claim',player,character],['release',player,character]]);
 });
});
