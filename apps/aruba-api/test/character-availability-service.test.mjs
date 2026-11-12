import test from 'node:test';
import assert from 'node:assert/strict';
import {createCharacterAvailabilityService} from '../src/character-availability-service.mjs';
const owner='4a3465ec-47d7-4021-9f0d-e70da8cbd001';
const campaign='f24f6bdd-a5f7-4521-aa16-bc0854dc5841';
const char='d2344aae-20d0-4395-8039-49d0aa3657f9';
test('availability only queries restricted SQL functions and returns booleans',async()=>{
 const seen=[];
 const service=createCharacterAvailabilityService({pool:{query:async(sql,args)=>{
  seen.push({sql,args});
  if(sql.includes('list_owned_character_availability'))
   return {rows:[{character_id:char,available_for_players:false}]};
  return {rows:[{changed:true}]};
 }}});
 assert.deepEqual(await service.list(owner,campaign),
  {characters:[{id:char,availableForPlayers:false}]});
 assert.deepEqual(await service.set(owner,campaign,char,true),
  {id:char,availableForPlayers:true});
 assert.match(seen[0].sql,/list_owned_character_availability/);
 assert.match(seen[1].sql,/set_owned_character_availability/);
 assert.deepEqual(seen[1].args,[owner,campaign,char,true]);
 assert.ok(seen.every(s=>!(/INSERT |UPDATE |DELETE /.test(s.sql))));
});
test('invalid state and absent owned character are rejected without writes',async()=>{
 const service=createCharacterAvailabilityService({pool:{query:async()=>({rows:[{changed:false}]})}});
 await assert.rejects(()=>service.set(owner,campaign,char,true),e=>e.status===404);
 for(const value of ['true',null,undefined,0])
  await assert.rejects(()=>service.set(owner,campaign,char,value),e=>e.status===400);
 await assert.rejects(()=>service.list(owner,'wrong'),e=>e.status===400);
});
