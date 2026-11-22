import test from 'node:test';
import assert from 'node:assert/strict';
import {rotateCampaignInvite,previewCampaignInvite,joinCampaignInvite} from '../src/client.mjs';

const owner='11111111-1111-4111-8111-111111111111';
const player='22222222-2222-4222-8222-222222222222';
const campaignId='33333333-3333-4333-8333-333333333333';
const code='HG-0123456789ABCDEF0123';
const campaign={id:campaignId,ownerId:owner,name:'Varco',description:'',ruleset:'hsc',createdAt:'2026-11-16T00:00:00.000Z'};
const response=data=>({status:200,ok:true,json:async()=>data});

test('invite rotation is owner-scoped and accepts only the exact one-time response',async()=>{
 let request;
 const invite=await rotateCampaignInvite(async(path,options)=>{
  request={path,options};
  return response({invite:{campaignId,code,expiresAt:'2026-11-23T12:00:00.000Z'}});
 },campaignId,owner);
 assert.deepEqual(invite,{campaignId,code,expiresAt:'2026-11-23T12:00:00.000Z'});
 assert.equal(Object.isFrozen(invite),true);
 assert.equal(request.path,'/vtt/campaigns/'+campaignId+'/invite-code');
 assert.deepEqual(request.options,{method:'POST',credentials:'same-origin',cache:'no-store',redirect:'error'});
 await assert.rejects(()=>rotateCampaignInvite(async()=>response({invite:{campaignId,code,expiresAt:'not-a-date'}}),campaignId,owner),/Risposta invito/);
 await assert.rejects(()=>rotateCampaignInvite(async()=>response({invite:{campaignId,code,expiresAt:'2026-11-23T12:00:00.000Z',ownerId:owner}}),campaignId,owner),/Risposta invito/);
});

test('invite preview normalizes only the bounded code and rejects owner or forged campaigns',async()=>{
 let request;
 const value=await previewCampaignInvite(async(path,options)=>{
  request={path,options};return response({campaign});
 },' hg-0123456789abcdef0123 ',player);
 assert.equal(value.id,campaignId);
 assert.equal(request.path,'/vtt/campaign-invites/preview?code='+code);
 assert.equal(request.options.method,'GET');
 for(const bad of ['',campaignId,'HG-0123456789ABCDEF012Z'])
  await assert.rejects(()=>previewCampaignInvite(async()=>{throw new Error('network');},bad,player),/Codice invito/);
 await assert.rejects(()=>previewCampaignInvite(async()=>response({campaign}),code,owner),/proprietario/);
 await assert.rejects(()=>previewCampaignInvite(async()=>response({campaign:{...campaign,ownerId:player}}),code,player),/proprietario/);
});

test('invite join sends only code and accepts only an authorized player campaign',async()=>{
 let request;
 const value=await joinCampaignInvite(async(path,options)=>{
  request={path,options};return response({campaign});
 },code,player);
 assert.equal(value.id,campaignId);
 assert.equal(request.path,'/vtt/campaign-invites/join');
 assert.equal(request.options.method,'POST');
 assert.equal(request.options.credentials,'same-origin');
 assert.deepEqual(JSON.parse(request.options.body),{code});
 await assert.rejects(()=>joinCampaignInvite(async()=>({status:404,ok:false}),code,player),/scaduto/);
 await assert.rejects(()=>joinCampaignInvite(async()=>response({campaign,memberRole:'player'}),code,player),/Adesione invito/);
 await assert.rejects(()=>joinCampaignInvite(async()=>response({campaign}),code,owner),/proprietario/);
});
