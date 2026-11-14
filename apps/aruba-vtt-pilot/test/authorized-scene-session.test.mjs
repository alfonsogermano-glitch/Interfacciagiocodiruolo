import test from 'node:test';
import assert from 'node:assert/strict';
import {createAuthorizedSceneSession} from '../src/authorized-scene-session.mjs';
const gm='12345678-1234-4123-8123-123456789abc';
const player='22345678-1234-4123-8123-123456789abc';
const campaign='32345678-1234-4123-8123-123456789abc';
const sceneId='42345678-1234-4123-8123-123456789abc';
const args={origin:'https://staging.hollowgate.quest',sceneId,WebSocketImpl:class {},PeerConnectionImpl:class {}};
test('scene sessions are disabled without server-provided feature flag and membership',()=>{
 const context={...args,campaign:{id:campaign,ownerId:gm}};
 for(const bootstrap of [null,{id:gm},{id:gm,gameSessionEnabled:false,campaignMemberships:[{campaignId:campaign,userId:gm,role:'gm'}]},
  {id:gm,gameSessionEnabled:true,campaignMemberships:[]},
  {id:gm,gameSessionEnabled:true,campaignMemberships:[{campaignId:campaign,userId:player,role:'gm'}]},
  {id:gm,gameSessionEnabled:true,campaignMemberships:[{campaignId:campaign,userId:gm,role:'player'}]}])
  assert.throws(()=>createAuthorizedSceneSession({...context,bootstrap}),/not authorized/);
});
test('scene sessions reject malformed campaign, owner and scene identifiers before constructing sockets',()=>{
 const bootstrap={id:gm,gameSessionEnabled:true,campaignMemberships:[{campaignId:campaign,userId:gm,role:'gm'}]};
 for(const patch of [{sceneId:'bad'},{campaign:{id:'bad',ownerId:gm}},{campaign:{id:campaign,ownerId:'bad'}}])
  assert.throws(()=>createAuthorizedSceneSession({...args,bootstrap,campaign:{id:campaign,ownerId:gm},...patch}),/not authorized/);
});
