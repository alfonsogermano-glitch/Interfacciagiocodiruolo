import test from 'node:test';
import assert from 'node:assert/strict';
import {validateBootstrap} from '../src/client.mjs';
const userId='00000000-0000-4000-8000-000000000002';
const campaignId='00000000-0000-4000-8000-000000000001';
const data={backend:'aruba-staging',user:{id:userId,email:'gm@example.org',displayName:'GM',role:'standard'},capabilities:{campaigns:{read:true,write:true},characters:{read:false,write:false},gameSession:true},campaignMemberships:[{userId,campaignId,role:'gm'}]};
test('verified GM bootstrap is immutable and enables only owned campaign sessions',()=>{
 const session=validateBootstrap(data);
 assert.equal(session.gameSessionEnabled,true);
 assert.deepEqual(session.campaignMemberships,[{userId,campaignId,role:'gm'}]);
 assert.equal(Object.isFrozen(session.campaignMemberships),true);
});
test('malformed, duplicated and player-authored bootstrap memberships fail closed',()=>{
 for(const campaignMemberships of [undefined,[],[{userId,campaignId,role:'player'}],
  [{userId:'00000000-0000-4000-8000-000000000003',campaignId,role:'gm'}],
  [data.campaignMemberships[0],data.campaignMemberships[0]]]){
  const candidate={...data,campaignMemberships};
  if(Array.isArray(campaignMemberships)&&campaignMemberships.length===0){
   assert.deepEqual(validateBootstrap(candidate).campaignMemberships,[]);
  }else assert.throws(()=>validateBootstrap(candidate));
 }
});
