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

test('save stores original CharacterSheetData and refuses forged owner/campaign/image payloads',async()=>{
 let saved;
 const sheet={style:'Jock',viaggio:'Campione',ambiti:{Fisico:2,Scuola:1,Carisma:1,Strada:1},
  abilita:{Muscoli:2},tratti:[],equipment:[],freschezza:12,follia:9};
 const pool={query:async(sql,params)=>{
  if(sql.includes('save_owned_character_sheet')){saved=params;return {rows:[{id:char}]}};
  if(sql.includes('list_character_drafts'))return {rows:[{id:char,campaign_id:campaign,owner_id:owner,name:'Ken',sheet_data:sheet,status:'active'}]};
  throw Error(sql);
 }};
 const service=createCharacterService({pool});
 const result=await service.save(owner,campaign,char,{campaignId:campaign,name:' Ken ',sheetData:sheet});
 assert.equal(result.character.name,'Ken');assert.equal(result.character.status,'active');
 assert.equal(saved[0],owner);assert.equal(saved[2],char);
 assert.equal(saved[3],'Ken');assert.deepEqual(JSON.parse(saved[4]),sheet);
 for(const bad of [
  {campaignId:campaign,name:'Ken',sheetData:sheet,ownerId:'forged'},
  {campaignId:owner,name:'Ken',sheetData:sheet},
  {campaignId:campaign,name:'Ken',sheetData:{...sheet,portraitImageUrl:'data:image/png;base64,AAAA'}},
  {campaignId:campaign,name:'Ken',sheetData:{...sheet,portraitImageUrl:'https://x.supabase.co/image'}},
  {campaignId:campaign,name:'Ken',sheetData:{}},
 ])await assert.rejects(()=>service.save(owner,campaign,char,bad));
 const hidden=createCharacterService({pool:{query:async()=>({rows:[{id:null}]})}});
 await assert.rejects(()=>hidden.save(owner,campaign,char,{campaignId:campaign,name:'Ken',sheetData:sheet}),e=>e.status===404);
});
