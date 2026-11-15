import test from 'node:test';
import assert from 'node:assert/strict';
import {listCharacterAssignments,setCharacterAssignment,validateBootstrap} from '../src/client.mjs';
const campaign='b0da2f75-f700-454c-9ba4-65bc0c8838ef';
const char='eeaa5632-f050-4eb4-a0f4-3981443bf19e';
const player='2675f0a2-ad43-4f2d-ad01-6cfb9e8919b0';
test('assignment API reads verified IDs without accepting duplicate records',async()=>{
 let request;
 const links=await listCharacterAssignments(async(url,options)=>{
  request={url,options};return {ok:true,json:async()=>({assignments:[{characterId:char,playerId:player}]})};
 },campaign);
 assert.equal(links.get(char),player);
 assert.equal(request.options.credentials,'same-origin');
 assert.equal(request.url,'/vtt/character-assignments?campaignId='+campaign);
 await assert.rejects(()=>listCharacterAssignments(async()=>({ok:true,json:async()=>({
  assignments:[{characterId:char,playerId:player},{characterId:char,playerId:player}]
 })}),campaign));
});
test('assignment writes only after server confirms exact character and recipient',async()=>{
 let sent;
 const result=await setCharacterAssignment(async(url,options)=>{
  sent={url,options};return {ok:true,json:async()=>({characterId:char,playerId:player})};
 },campaign,char,player);
 assert.deepEqual(result,{characterId:char,playerId:player});
 assert.deepEqual(JSON.parse(sent.options.body),{campaignId:campaign,playerId:player});
 assert.equal(sent.options.method,'PATCH');
 assert.equal(sent.options.credentials,'same-origin');
 await assert.rejects(()=>setCharacterAssignment(async()=>({ok:true,json:async()=>({
  characterId:char,playerId:'forged'
 })}),campaign,char,player),/Conferma/);
 await assert.rejects(()=>setCharacterAssignment(async()=>({ok:false,status:404}),campaign,char,player));
});
test('bootstrap rejects assignment capability without roster and availability',()=>{
 const user={id:player,email:'test@example.org',displayName:'Test',role:'standard'};
 const base={backend:'aruba-staging',user,capabilities:{
  campaigns:{read:true,write:true},characters:{read:true,write:true},
  characterAvailability:{read:false,write:false},
  campaignRoster:{read:false,write:false},
  characterAssignments:{read:true,write:true},gameSession:false,
 }};
 assert.throws(()=>validateBootstrap(base));
 assert.equal(validateBootstrap({...base,capabilities:{...base.capabilities,
  characterAvailability:{read:true,write:true},
  campaignRoster:{read:true,write:false},
 }}).characterAssignmentsEnabled,true);
});
