// Native campaign projection transport: cookie auth, validation, no mutations.
import test from 'node:test';
import assert from 'node:assert/strict';
import {loadNPCsByCampaign,loadMonstersByCampaign} from '../src/ArubaCatalogService.ts';
const actor='10000000-0000-4000-8000-000000000001';
const campaign='10000000-0000-4000-8000-000000000002';
globalThis.__HG_ARUBA_TOPBAR_IDENTITY__={id:actor};
const original=globalThis.fetch;
test('loadNPCsByCampaign validates the URL and the page',async()=>{
 const seen=[];
 globalThis.fetch=async(url)=>{seen.push(String(url));
  return {ok:true,json:async()=>[
   {kind:'npcs',id:'10000000-0000-4000-8000-000000000003',ownerId:actor,campaignId:campaign,
    name:'Custode',ruleset:'hsc',revision:1,status:'active',data:{},createdAt:'x',updatedAt:'x'}]};};
 try{
  const items=await loadNPCsByCampaign(campaign);
  assert.equal(items.length,1);
  assert.equal(items[0].kind,'npcs');
  assert.equal(items[0].campaignId,campaign);
  assert.equal(seen[0],'/vtt/catalog/native/by-campaign/npcs/'+campaign);
 }finally{globalThis.fetch=original;}
});
test('campaign id must be a uuid and malformed pages are rejected',async()=>{
 await assert.rejects(loadNPCsByCampaign('not-a-uuid'),/CAMPAIGN_ID_INVALID/);
 globalThis.fetch=async()=>({ok:true,json:async()=>[{id:'bad'}]});
 try{await assert.rejects(loadMonstersByCampaign(campaign));}finally{globalThis.fetch=original;}
});
