import test from 'node:test';
import assert from 'node:assert/strict';
import {createCampaignInviteService} from '../src/campaign-invite-service.mjs';

const owner='11111111-1111-4111-8111-111111111111';
const player='22222222-2222-4222-8222-222222222222';
const campaignId='33333333-3333-4333-8333-333333333333';
const row={id:campaignId,owner_id:owner,name:'Varco',description:'',ruleset:'hsc',created_at:'2026-11-16T00:00:00Z'};

test('owner rotates an expiring high-entropy invite while database receives only digest',async()=>{
 const seen=[];
 const service=createCampaignInviteService({
  pool:{query:async(sql,args)=>{seen.push({sql,args});return {rows:[{campaign_id:campaignId}]};}},
  now:()=>new Date('2026-11-16T12:00:00Z'),random:()=>Buffer.from('0123456789abcdef0123','hex'),
 });
 const result=await service.rotate(owner,campaignId);
 assert.equal(result.invite.code,'HG-0123456789ABCDEF0123');
 assert.equal(result.invite.expiresAt,'2026-11-23T12:00:00.000Z');
 assert.equal(seen[0].args[0],owner);
 assert.equal(seen[0].args[1],campaignId);
 assert.equal(Buffer.isBuffer(seen[0].args[2]),true);
 assert.equal(seen[0].args[2].length,32);
 assert.equal(seen[0].args.some(value=>value===result.invite.code),false);
});

test('preview and join use authenticated identity and exact digest only',async()=>{
 const seen=[];
 const service=createCampaignInviteService({pool:{query:async(sql,args)=>{seen.push({sql,args});return {rows:[row]};}}});
 assert.deepEqual((await service.preview(player,' hg-0123456789abcdef0123 ')).campaign,{id:campaignId,ownerId:owner,name:'Varco',description:'',ruleset:'hsc',createdAt:row.created_at});
 assert.equal((await service.join(player,'HG-0123456789ABCDEF0123')).campaign.id,campaignId);
 assert.deepEqual(seen.map(x=>x.args[0]),[player,player]);
 assert.equal(seen.every(x=>Buffer.isBuffer(x.args[1])&&x.args[1].length===32),true);
 for(const bad of ['',campaignId,'HG-TOO-SHORT','HG-0123456789ABCDEF012Z'])
  await assert.rejects(()=>service.join(player,bad),/Codice invito/);
 await assert.rejects(()=>service.preview('forged','HG-0123456789ABCDEF0123'),/Utente/);
});

test('missing, expired or unauthorized invites fail without campaign disclosure',async()=>{
 const service=createCampaignInviteService({pool:{query:async()=>({rows:[]})}});
 await assert.rejects(()=>service.preview(player,'HG-0123456789ABCDEF0123'),error=>error.status===404);
 await assert.rejects(()=>service.join(player,'HG-0123456789ABCDEF0123'),error=>error.status===404);
 await assert.rejects(()=>service.rotate(owner,'invalid'),error=>error.status===400);
});
