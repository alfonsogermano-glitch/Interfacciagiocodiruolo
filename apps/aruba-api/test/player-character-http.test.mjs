import test from 'node:test';
import assert from 'node:assert/strict';
import {once} from 'node:events';
import {createApp} from '../src/app.mjs';
import {createAuthHttpHandler} from '../src/auth-http.mjs';
const origin='https://staging.hollowgate.quest';
const cookie='__Host-hg_session='+'A'.repeat(43);
const player='4a3465ec-47d7-4021-9f0d-e70da8cbd002';
const campaign='f24f6bdd-a5f7-4521-aa16-bc0854dc5841';
const mockCampaigns={list:async()=>({campaigns:[]}),create:async()=>{},update:async()=>{}};
const mockCharacters={list:async()=>({characters:[]}),create:async()=>{},save:async()=>{},archive:async()=>{}};
const mockRoster={list:async()=>({members:[]})};
const mockAvailability={list:async()=>({characters:[]}),set:async()=>({})};
const mockAssignments={list:async()=>({assignments:[]}),set:async()=>({})};
async function serve(handler,fn){
 const app=createApp({checkDatabase:async()=>{},authHandler:handler});
 app.listen(0,'127.0.0.1');await once(app,'listening');
 try{await fn('http://127.0.0.1:'+app.address().port);}
 finally{await new Promise(resolve=>app.close(resolve));}
}
const handler=playerCharacters=>createAuthHttpHandler({
 origin,login:async()=>{},getSessionUser:async()=>({id:player}),revokeSession:async()=>{},
 campaigns:mockCampaigns,characters:mockCharacters,campaignRoster:mockRoster,
 characterAvailability:mockAvailability,characterAssignments:mockAssignments,
 playerCharacters,
});
test('player sheet access disabled by default, capability is read-only',async()=>{
 await serve(handler(null),async base=>{
  const response=await fetch(base+'/vtt/player-characters?campaignId='+campaign,{headers:{cookie}});
  assert.equal(response.status,404);
  const payload=await (await fetch(base+'/vtt/bootstrap',{headers:{cookie}})).json();
  assert.deepEqual(payload.capabilities.playerCharacters,{read:false,write:false});
 });
 assert.throws(()=>createAuthHttpHandler({
  origin,login:async()=>{},getSessionUser:async()=>null,revokeSession:async()=>{},
  playerCharacters:{list:async()=>({characters:[]}),listCampaigns:async()=>({campaigns:[]})},
 }),/require assignments/);
});
test('player-specific read trusts cookie only, never parameters; no write endpoint',async()=>{
 const calls=[];
 await serve(handler({
  list:async(...args)=>{calls.push(['chars',...args]);return {characters:[]};},
  listCampaigns:async(...args)=>{calls.push(['campaigns',...args]);return {campaigns:[]};},
 }),async base=>{
  const url=base+'/vtt/player-characters?campaignId='+campaign;
  assert.equal((await fetch(base+'/vtt/player-campaigns')).status,401);
  assert.equal((await fetch(base+'/vtt/player-campaigns',{headers:{cookie}})).status,200);
  assert.equal((await fetch(base+'/vtt/player-campaigns?userId=forged',{headers:{cookie}})).status,404);
  assert.equal((await fetch(url)).status,401);
  assert.equal((await fetch(url,{headers:{cookie}})).status,200);
  assert.equal((await fetch(url+'&playerId=forged',{headers:{cookie}})).status,400);
  assert.equal((await fetch(url.replace('campaignId=','campaignId=bad&campaignId='),{headers:{cookie}})).status,400);
  assert.equal((await fetch(base+'/vtt/player-characters',{method:'POST',
   headers:{cookie,origin,'content-type':'application/json'},body:'{}'})).status,404);
  const caps=await (await fetch(base+'/vtt/bootstrap',{headers:{cookie}})).json();
  assert.deepEqual(caps.capabilities.playerCharacters,{read:true,write:false});
 });
 assert.deepEqual(calls,[['campaigns',player],['chars',player,campaign]]);
});
