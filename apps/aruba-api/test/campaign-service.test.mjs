import test from 'node:test';
import assert from 'node:assert/strict';
import {createCampaignService,CampaignRejected} from '../src/campaign-service.mjs';
const OWNER='971e26ae-eecb-4f37-ad03-56b0c3000789';
test('campaigns have server-controlled owner and validated payload',async()=>{
 let inserted;
 const pool={query:async(sql,params)=>{
   if(sql.includes('create_owned_campaign')){inserted=params;return {rows:[{id:'new-id'}]};}
   if(sql.includes('list_owned_campaigns'))return {rows:[{
     id:'new-id',name:'Prova',description:'',ruleset:'hsc',
     owner_id:OWNER,created_at:new Date(),updated_at:new Date(),last_opened_at:null,
   }]};
   throw new Error(sql);
 }};
 const service=createCampaignService({pool});
 const r=await service.create(OWNER,{name:'Prova',description:'',ruleset:'hsc'});
 assert.equal(inserted[0],OWNER);
 assert.equal(r.campaign.ownerId,OWNER);
 for(const payload of [
  {name:'X',description:'',ruleset:'hsc',ownerId:'someone-else'},
  {name:'',description:'',ruleset:'hsc'},
  {name:'X',description:'',ruleset:'bad'},
  {name:'X',description:'',ruleset:'hsc',id:'spoofed'},
 ])await assert.rejects(()=>service.create(OWNER,payload),CampaignRejected);
});

test('campaign editing requires real owner and only name/description (no ruleset changes)',async()=>{
 const id='be2f1a87-b8ee-4b34-9da0-07efda11379a';
 let updated;
 const pool={query:async(sql,params)=>{
  if(sql.includes('update_owned_campaign')){updated=params;return {rows:[{id}]};}
  if(sql.includes('list_owned_campaigns'))return {rows:[{id,name:'Nuovo',description:'Test',ruleset:'hsc',owner_id:OWNER,created_at:new Date()}]};
  throw new Error(sql);
 }};
 const service=createCampaignService({pool});
 const data=await service.update(OWNER,id,{name:' Nuovo ',description:'Test'});
 assert.deepEqual(updated,[OWNER,id,'Nuovo','Test']);
 assert.equal(data.campaign.ruleset,'hsc');
 for(const body of [{name:'X',description:'',ruleset:'custom'},{name:'',description:''},{name:'X'}, {name:'X',description:'',ownerId:OWNER}])
  await assert.rejects(()=>service.update(OWNER,id,body),CampaignRejected);
 await assert.rejects(()=>service.update(OWNER,'bad-id',{name:'X',description:''}),CampaignRejected);
 const missing=createCampaignService({pool:{query:async()=>({rows:[{id:null}]})}});
 await assert.rejects(()=>missing.update(OWNER,id,{name:'X',description:''}),error=>error.status===404);
});
