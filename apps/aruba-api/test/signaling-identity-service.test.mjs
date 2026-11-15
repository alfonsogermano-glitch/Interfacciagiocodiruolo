import test from 'node:test';
import assert from 'node:assert/strict';
import {createSignalingIdentityService} from '../src/signaling-identity-service.mjs';

const campaign='00000000-0000-4000-8000-000000000001';
const owner='00000000-0000-4000-8000-000000000002';
const player='00000000-0000-4000-8000-000000000003';
let calls;
function setup({user={id:player},role='player',owned=[]}={}){
 calls=[];
 const service=createSignalingIdentityService({
  getSessionUser:async token=>{calls.push(['session',token]);return user;},
  pool:{query:async(sql,params)=>{
   calls.push(['db',sql,params]);return {rows:[{member_role:role}]};
  }},
  campaigns:{list:async userId=>{
   calls.push(['owned',userId]);return {campaigns:owned};
  }},
 });
 return service;
}
test('player membership comes from authenticated session and current SQL role',async()=>{
 const gate=setup();
 const proof=await gate.verify({sessionToken:'server-cookie',campaignId:campaign,
  connectionRole:'player',userId:owner,role:'gm'});
 assert.deepEqual(proof,{userId:player,campaignId:campaign,role:'player'});
 assert.equal(Object.isFrozen(proof),true);
 assert.deepEqual(calls[1][2],[player,campaign]);
 assert.equal(calls.some(v=>v[0]==='owned'),false);
});
test('rejects revoked members and missing sessions on reconnection',async()=>{
 const gate=setup({role:null});
 await assert.rejects(gate.verify({sessionToken:'server-cookie',campaignId:campaign,
  connectionRole:'player'}),{status:403});
 const noSession=setup({user:null});
 await assert.rejects(noSession.verify({sessionToken:'expired',campaignId:campaign,
  connectionRole:'player'}),{status:401});
 assert.equal(calls.some(v=>v[0]==='db'),false);
});
test('campaign owner may host but a GM member cannot impersonate the owner',async()=>{
 const gate=setup({user:{id:owner},role:'gm',
  owned:[{id:campaign,ownerId:owner}]});
 assert.deepEqual(await gate.verify({sessionToken:'server-cookie',campaignId:campaign,
  connectionRole:'host'}),{userId:owner,campaignId:campaign,role:'gm'});
 const coGM=setup({user:{id:player},role:'gm',owned:[]});
 await assert.rejects(coGM.verify({sessionToken:'server-cookie',campaignId:campaign,
  connectionRole:'host'}),{status:403});
});
test('invalid role, campaign and token are rejected before database access',async()=>{
 const gate=setup();
 for(const input of [
  {sessionToken:'',campaignId:campaign,connectionRole:'player'},
  {sessionToken:'server-cookie',campaignId:'../other',connectionRole:'player'},
  {sessionToken:'server-cookie',campaignId:campaign,connectionRole:'gm'},
 ]){
  await assert.rejects(gate.verify(input),{status:401});
 }
 assert.equal(calls.length,0);
});
test('player cannot become a host and campaign owner cannot join as player',async()=>{
 let gate=setup({role:'player'});
 await assert.rejects(gate.verify({sessionToken:'cookie',campaignId:campaign,connectionRole:'host'}),{status:403});
 gate=setup({user:{id:owner},role:'gm'});
 await assert.rejects(gate.verify({sessionToken:'cookie',campaignId:campaign,connectionRole:'player'}),{status:403});
});
