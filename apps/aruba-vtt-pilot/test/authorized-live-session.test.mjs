import test from 'node:test';
import assert from 'node:assert/strict';
import {createAuthorizedLiveSession} from '../src/authorized-live-session.mjs';
const gm='12345678-1234-4123-8123-123456789abc';
const player='22345678-1234-4123-8123-123456789abc';
const campaign='32345678-1234-4123-8123-123456789abc';
const args={origin:'https://staging.hollowgate.quest/',WebSocketImpl:class {},PeerConnectionImpl:class {}};
test('live session cannot start without an explicit verified game-session capability',()=>{
 assert.throws(()=>createAuthorizedLiveSession({...args,bootstrap:{id:gm,campaignMemberships:[{campaignId:campaign,userId:gm,role:'gm'}]},campaign:{id:campaign,ownerId:gm}}),/not authorized/);
 assert.throws(()=>createAuthorizedLiveSession({...args,bootstrap:{id:gm,gameSessionEnabled:false,campaignMemberships:[{campaignId:campaign,userId:gm,role:'gm'}]},campaign:{id:campaign,ownerId:gm}}),/not authorized/);
});
test('live session rejects owner-only lists, wrong users, wrong roles, and other campaigns',()=>{
 const owned={id:gm,gameSessionEnabled:true,campaigns:[{id:campaign}]};
 assert.throws(()=>createAuthorizedLiveSession({...args,bootstrap:owned,campaign:{id:campaign,ownerId:gm}}),/not authorized/);
 for(const membership of [[],[{campaignId:campaign,userId:gm,role:'gm'}],[{campaignId:campaign,userId:player,role:'gm'}],[{campaignId:gm,userId:player,role:'player'}]]){
  assert.throws(()=>createAuthorizedLiveSession({...args,bootstrap:{id:player,gameSessionEnabled:true,campaignMemberships:membership},campaign:{id:campaign,ownerId:gm}}),/not authorized/);
 }
 assert.throws(()=>createAuthorizedLiveSession({...args,bootstrap:{id:gm,gameSessionEnabled:true,campaignMemberships:[{campaignId:campaign,userId:gm,role:'gm'}]},campaign:{id:'invalid',ownerId:gm}}),/not authorized/);
});
