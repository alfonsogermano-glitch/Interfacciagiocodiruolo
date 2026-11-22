import test from 'node:test';
import assert from 'node:assert/strict';
import {createCharacterClaimService} from '../src/character-claim-service.mjs';
const player='4a3465ec-47d7-4021-9f0d-e70da8cbd002';
const character='d2344aae-20d0-4395-8039-49d0aa3657f9';
const campaign='f24f6bdd-a5f7-4521-aa16-bc0854dc5841';
test('claim and release pass only cookie player plus path character to restricted SQL',async()=>{
 const calls=[];
 const service=createCharacterClaimService({pool:{query:async(sql,args)=>{calls.push({sql,args});return {rows:[{campaign_id:campaign}]};}}});
 assert.deepEqual(await service.claim(player,character),{characterId:character,campaignId:campaign});
 assert.deepEqual(await service.release(player,character),{characterId:character,campaignId:campaign});
 assert.deepEqual(calls.map(call=>call.args),[[player,character],[player,character]]);
 assert.match(calls[0].sql,/claim_available_character/);assert.match(calls[1].sql,/release_claimed_character/);
});
test('claimable list is player and campaign scoped through one DEFINER function',async()=>{
 const calls=[];const service=createCharacterClaimService({pool:{query:async(sql,args)=>{calls.push({sql,args});return {rows:[{id:character,campaign_id:campaign,owner_id:'4a3465ec-47d7-4021-9f0d-e70da8cbd001',name:'PG',sheet_data:{},status:'active',created_at:'a',updated_at:'b'}]};}}});
 assert.equal((await service.list(player,campaign)).characters[0].id,character);
 assert.match(calls[0].sql,/list_claimable_characters/);assert.deepEqual(calls[0].args,[player,campaign]);
 await assert.rejects(()=>service.list(player,'bad'),error=>error.status===400);
});
test('current logical claim is cookie player and campaign scoped',async()=>{
 const service=createCharacterClaimService({pool:{query:async()=>({rows:[{character_id:character,claimed_at:'2026-11-16T00:00:00.000Z'}]})}});
 assert.deepEqual(await service.current(player,campaign),{claim:{characterId:character,claimedAt:'2026-11-16T00:00:00.000Z'}});
 const empty=createCharacterClaimService({pool:{query:async()=>({rows:[]})}});
 assert.deepEqual(await empty.current(player,campaign),{claim:null});
});
test('owner claim roster comes only from owner-scoped DEFINER function',async()=>{
 const calls=[];const service=createCharacterClaimService({pool:{query:async(sql,args)=>{calls.push({sql,args});return {rows:[{character_id:character,player_id:player,claimed_at:'2026-11-16T00:00:00.000Z'}]};}}});
 assert.deepEqual(await service.owned('4a3465ec-47d7-4021-9f0d-e70da8cbd001',campaign),{claims:[{characterId:character,playerId:player,claimedAt:'2026-11-16T00:00:00.000Z'}]});
 assert.match(calls[0].sql,/list_owned_character_claims/);
});
test('claimed sheet save validates complete model and reloads authorized row',async()=>{
 const calls=[];const row={id:character,campaign_id:campaign,owner_id:'4a3465ec-47d7-4021-9f0d-e70da8cbd001',name:'PG',sheet_data:{style:'Jock',viaggio:'',ambiti:{},abilita:{},tratti:[],equipment:[]},status:'active',created_at:'a',updated_at:'b'};
 const service=createCharacterClaimService({pool:{query:async(sql,args)=>{calls.push({sql,args});return sql.includes('save_claimed')?{rows:[{id:character}]}:{rows:[row]};}}});
 const body={campaignId:campaign,name:'PG',sheetData:row.sheet_data};
 assert.equal((await service.save(player,campaign,character,body)).character.id,character);
 assert.match(calls[0].sql,/save_claimed_character_sheet/);assert.match(calls[1].sql,/list_assigned_player_character_sheets/);
 await assert.rejects(()=>service.save(player,campaign,character,{...body,sheetData:{}}),error=>error.status===400);
});
test('invalid IDs and SQL rejection fail closed',async()=>{
 let calls=0;const service=createCharacterClaimService({pool:{query:async()=>{calls++;return {rows:[{campaign_id:null}]};}}});
 await assert.rejects(()=>service.claim('bad',character),error=>error.status===400);assert.equal(calls,0);
 await assert.rejects(()=>service.claim(player,character),error=>error.status===409);
 await assert.rejects(()=>service.release(player,character),error=>error.status===409);
});
