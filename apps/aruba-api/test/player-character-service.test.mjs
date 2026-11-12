import test from 'node:test';
import assert from 'node:assert/strict';
import {createPlayerCharacterService} from '../src/player-character-service.mjs';
const player='4a3465ec-47d7-4021-9f0d-e70da8cbd002';
const campaign='f24f6bdd-a5f7-4521-aa16-bc0854dc5841';
const owner='4a3465ec-47d7-4021-9f0d-e70da8cbd001';
const char='d2344aae-20d0-4395-8039-49d0aa3657f9';
test('read uses only the authenticated player and isolated SQL function',async()=>{
 const seen=[];
 const service=createPlayerCharacterService({pool:{query:async(sql,args)=>{
  seen.push({sql,args});
  return {rows:[{id:char,campaign_id:campaign,owner_id:owner,
   name:'Mara',sheet_data:{style:'Jock'},status:'active'}]};
 }}});
 const value=await service.list(player,campaign);
 assert.equal(value.characters[0].ownerId,owner);
 assert.deepEqual(seen[0].args,[player,campaign]);
 assert.match(seen[0].sql,/^SELECT \* FROM hollowgate_vtt.list_assigned_player_character_sheets/);
 assert.doesNotMatch(seen[0].sql,/JOIN |INSERT |UPDATE |DELETE /);
});
test('invalid identities fail closed before hitting the database',async()=>{
 let count=0;
 const service=createPlayerCharacterService({pool:{query:async()=>{count++;return {rows:[]};}}});
 await assert.rejects(()=>service.list('forged',campaign),e=>e.status===400);
 await assert.rejects(()=>service.list(player,'forged'),e=>e.status===400);
 assert.equal(count,0);
});

test('joined campaign list is a restricted SQL query by cookie player identity',async()=>{
 const seen=[];
 const service=createPlayerCharacterService({pool:{query:async(sql,args)=>{
  seen.push({sql,args});return {rows:[{id:campaign,owner_id:owner,name:'Campagna',
   description:'',ruleset:'hsc',created_at:'2026-11-12T00:00:00Z'}]};
 }}});
 const result=await service.listCampaigns(player);
 assert.equal(result.campaigns[0].ownerId,owner);
 assert.deepEqual(seen[0].args,[player]);
 assert.match(seen[0].sql,/^SELECT \* FROM hollowgate_vtt.list_joined_player_campaigns/);
 await assert.rejects(()=>service.listCampaigns('invalid'),e=>e.status===400);
});
