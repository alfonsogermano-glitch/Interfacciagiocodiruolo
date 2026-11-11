import test from 'node:test';
import assert from 'node:assert/strict';
import {createCharacterService} from '../src/character-service.mjs';
const owner='971e26ae-eecb-4f37-ad03-56b0c3000789';
const campaign='be2f1a87-b8ee-4b34-9da0-07efda11379a';
const char='ee2f1a87-b8ee-4b34-9da0-07efda11379a';
test('draft names are validated and characters are scoped by session identity and campaign',async()=>{
 let insert;
 const pool={query:async(sql,params)=>{
  if(sql.includes('create_character_draft')){insert=params;return {rows:[{id:char}]}};
  if(sql.includes('list_character_drafts'))return {rows:[{id:char,owner_id:owner,campaign_id:campaign,name:'Test',status:'draft',sheet_data:{},created_at:new Date()}]};
  throw Error(sql);
 }};
 const service=createCharacterService({pool});
 const r=await service.create(owner,campaign,{name:' Test '});
 assert.deepEqual(insert,[owner,campaign,'Test']);
 assert.equal(r.character.sheetData.constructor,Object);
 const list=await service.list(owner,campaign);
 assert.equal(list.characters[0].campaignId,campaign);
 for(const input of [{name:'Test',ownerId:'spoof'},{name:'',sheetData:{}},{name:'X',ruleset:'hsc'},{}])
  await assert.rejects(()=>service.create(owner,campaign,input));
 await assert.rejects(()=>service.list(owner,'invalid'));
});
test('non-owner draft creation is rejected without fake data',async()=>{
 const service=createCharacterService({pool:{query:async()=>({rows:[{id:null}]})}});
 await assert.rejects(()=>service.create(owner,campaign,{name:'test'}),error=>error.status===404);
});
