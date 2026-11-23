import test from 'node:test';
import assert from 'node:assert/strict';
import {createLogicalCharacterService} from '../src/logical-character-service.mjs';
const owner='4a3465ec-47d7-4021-9f0d-e70da8cbd001';
const player='4a3465ec-47d7-4021-9f0d-e70da8cbd002';
const after='4a3465ec-47d7-4021-9f0d-e70da8cbd002';
const character='d2344aae-20d0-4395-8039-49d0aa3657f9';
const campaign='f24f6bdd-a5f7-4521-aa16-bc0854dc5841';
test('logical owner listing reads one restricted function and slices explicit cursors',async()=>{
 const calls=[];
 const pool={query:async(sql,args)=>{calls.push({sql,args});return {rows:[]};}};
 const service=createLogicalCharacterService({pool});
 assert.deepEqual(await service.list(owner),{characters:[],nextCursor:null});
 assert.deepEqual(calls[0].args,[owner,null]);
 assert.deepEqual(await service.list(owner,after),{characters:[],nextCursor:null});
 assert.deepEqual(calls[1].args,[owner,after]);
 assert.match(calls[0].sql,/list_logical_owner_characters/);
 await assert.rejects(()=>service.list('bad'),error=>error.status===400);
 await assert.rejects(()=>service.list(owner,'bad'),error=>error.status===400);
});
test('logical owner listing maps owner provenance and applies bounded continuation',async()=>{
 const mkId=(n)=>('00000000-0000-4000-8000-'+String(n).padStart(12,'0')).slice(0,36);
 const rows=Array.from({length:101},(_,index)=>({
  id:mkId(index+1),campaign_id:index===0?campaign:null,owner_id:owner,logical_owner_id:index===0?player:owner,
  original_owner_id:owner,claimable_origin:index>0,ruleset:'hsc',name:'PG '+index,
  sheet_data:{style:'Jock'},status:'active',available_for_players:index>0,
  created_at:'2026-11-23T00:00:00.000Z',updated_at:'2026-11-23T00:00:00.000Z'}));
 const calls=[];
 const pool={query:async(sql,args)=>{calls.push({sql,args});return {rows:args[1]===null?rows:rows.slice(0,1)};}};
 const service=createLogicalCharacterService({pool});
 const first=await service.list(owner);
 assert.equal(first.characters.length,100);
 assert.equal(first.nextCursor,rows[99].id);
 const second=await service.list(owner,first.nextCursor);
 assert.equal(second.characters.length,1);
 assert.equal(second.characters[0].id,rows[0].id);
 assert.equal(second.nextCursor,null);
 assert.deepEqual(Object.keys(first.characters[0]),['id','campaignId','ownerId','logicalOwnerId','originalOwnerId','claimableOrigin','ruleset','name','sheetData','status','availableForPlayers','createdAt','updatedAt']);
 assert.equal(first.characters[0].logicalOwnerId,player);
 assert.equal(first.characters[0].originalOwnerId,owner);
 assert.equal(first.characters[0].claimableOrigin,false);
 assert.equal(first.characters[0].ruleset,'hsc');
});
test('assignment outcome is mapped to the original authorization and ruleset errors',async()=>{
 const calls=[];
 const pool={query:async(sql,args)=>{calls.push({sql,args});return {rows:[{outcome:'assigned',campaign_id:campaign,ruleset:'hsc'}]};}};
 const service=createLogicalCharacterService({pool});
 assert.deepEqual(await service.assign(owner,character,campaign),
  {characterId:character,assignment:{outcome:'assigned',campaignId:campaign,ruleset:'hsc'}});
 assert.deepEqual(calls[0].args,[owner,character,campaign]);
 assert.match(calls[0].sql,/assign_logical_character_to_campaign/);
 const detached=createLogicalCharacterService({pool:{query:async()=>({rows:[{outcome:'detached',campaign_id:null,ruleset:null}]})}});
 assert.deepEqual(await detached.assign(owner,character,null),{characterId:character,assignment:{outcome:'detached',campaignId:null,ruleset:null}});
 await assert.rejects(()=>service.assign(owner,character,'bad'),error=>error.status===400);
 await assert.rejects(()=>service.assign('bad',character,campaign),error=>error.status===400);
});
test('authorization and ruleset failures fail with the original status boundaries',async()=>{
 const cases={
  not_found:404,
  forbidden:403,
  ruleset_mismatch:400,
 };
 for(const [outcome,status] of Object.entries(cases)){
  const service=createLogicalCharacterService({pool:{query:async()=>({rows:[{outcome,campaign_id:null,ruleset:null}]})}});
  const rejection=await service.assign(owner,character,campaign).then(()=>null,error=>error);
  assert.equal(rejection.status,status);
 }
 const service=createLogicalCharacterService({pool:{query:async()=>({rows:[]})}});
 await assert.rejects(()=>service.assign(owner,character,campaign),error=>error.status===404);
});
