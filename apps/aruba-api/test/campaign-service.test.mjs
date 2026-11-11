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
