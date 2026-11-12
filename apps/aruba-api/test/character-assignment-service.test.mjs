import test from 'node:test';
import assert from 'node:assert/strict';
import {createCharacterAssignmentService} from '../src/character-assignment-service.mjs';
const owner='4a3465ec-47d7-4021-9f0d-e70da8cbd001';
const campaign='f24f6bdd-a5f7-4521-aa16-bc0854dc5841';
const character='d2344aae-20d0-4395-8039-49d0aa3657f9';
const player='4a3465ec-47d7-4021-9f0d-e70da8cbd002';
test('only restricted PostgreSQL functions receive authenticated owner, never raw writes',async()=>{
 const calls=[];
 const service=createCharacterAssignmentService({pool:{query:async(sql,args)=>{
  calls.push({sql,args});
  return sql.includes('list_owned_character_player_assignments')?
   {rows:[{character_id:character,player_id:player}]}:{rows:[{changed:true}]};
 }}});
 assert.deepEqual(await service.list(owner,campaign),
  {assignments:[{characterId:character,playerId:player}]});
 assert.deepEqual(await service.set(owner,campaign,character,player),{characterId:character,playerId:player});
 assert.deepEqual(await service.set(owner,campaign,character,null),{characterId:character,playerId:null});
 assert.deepEqual(calls.map(x=>x.args),[[owner,campaign],[owner,campaign,character,player],[owner,campaign,character,null]]);
 assert.ok(calls.every(x=>/^SELECT hollowgate_vtt\./.test(x.sql)||/^SELECT \* FROM hollowgate_vtt\./.test(x.sql)));
});
test('invalid IDs and non-null invalid players fail before querying database',async()=>{
 let count=0;
 const service=createCharacterAssignmentService({pool:{query:async()=>{count++;return {rows:[]};}}});
 for(const args of [[owner,campaign,character,''],[owner,campaign,character,undefined],
  [owner,campaign,'nope',player],['bad',campaign,character,player]])
  await assert.rejects(()=>service.set(...args),e=>e.status===400);
 await assert.rejects(()=>service.list(owner,'bad'),e=>e.status===400);
 assert.equal(count,0);
});
test('database rejection cannot be reported as a successful assignment',async()=>{
 const service=createCharacterAssignmentService({pool:{query:async()=>({rows:[{changed:false}]})}});
 await assert.rejects(()=>service.set(owner,campaign,character,player),e=>e.status===404);
});
