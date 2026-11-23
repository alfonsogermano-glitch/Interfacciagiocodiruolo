import test from 'node:test';
import assert from 'node:assert/strict';
import {createUnassignedCatalogService} from '../src/unassigned-catalog-service.mjs';
const actor='11111111-1111-4111-8111-111111111111',source='22222222-2222-4222-8222-222222222222';
const target='33333333-3333-4333-8333-333333333333',copy='44444444-4444-4444-8444-444444444444';
test('catalog copies require exact owner, campaign and a distinct generated identity',async()=>{
 const base={id:copy,ownerId:actor,kind:'npcs',campaignId:target,revision:1};
 for(const patch of [{id:source},{ownerId:source},{campaignId:null},{campaignId:source},{kind:'monsters'},{revision:0}]){
  const service=createUnassignedCatalogService({pool:{query:async()=>({rows:[{item:{...base,...patch}}]})}});
  await assert.rejects(service.copyToCampaign(actor,'npcs',source,{revision:7,targetCampaignId:target}),
   /Invalid unassigned catalog result/);
 }
 const service=createUnassignedCatalogService({pool:{query:async()=>({rows:[{item:base}]})}});
 assert.deepEqual(await service.copyToCampaign(actor,'npcs',source,{revision:7,targetCampaignId:target}),{item:base});
});
