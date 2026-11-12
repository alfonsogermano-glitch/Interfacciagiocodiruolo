import test from 'node:test';
import assert from 'node:assert/strict';
import {createEntityNotesService} from '../src/entity-notes-service.mjs';
const owner='971e26ae-eecb-4f37-ad03-56b0c3000789';
const campaign='be2f1a87-b8ee-4b34-9da0-07efda11379a';
const character='ee2f1a87-b8ee-4b34-9da0-07efda11379a';
const id='aa2f1a87-b8ee-4b34-9da0-07efda11379a';
const row={id,tab_name:'Diario',content:'',content_rich:null,
 position:0,hidden:false,visibility:'all'};
test('notes stay scoped to authenticated owner, campaign and character',async()=>{
 const queries=[];
 const service=createEntityNotesService({pool:{query:async(sql,params)=>{
  queries.push([sql,params]);
  if(sql.includes('create_owned_character_note'))return {rows:[{id}]};
  return {rows:[row]};
 }}});
 const created=await service.create(owner,campaign,character,{tabName:' Diario '});
 assert.equal(created.note.tab_name,'Diario');
 assert.deepEqual(queries[0][1],[owner,campaign,character,'Diario',null]);
 const listed=await service.list(owner,campaign,character);
 assert.deepEqual(listed.notes[0].id,id);
 assert.deepEqual(queries[2][1],[owner,campaign,character,null]);
 await assert.rejects(()=>service.create(owner,campaign,character,{tabName:'x',ownerId:'spoof'}));
 await assert.rejects(()=>service.list(owner,campaign,'unsafe'));
});
test('rich TipTap notes are stored as JSON and archived reversibly',async()=>{
 const queryLog=[];
 const service=createEntityNotesService({pool:{query:async(sql,params)=>{
  queryLog.push({sql,params});
  if(sql.includes('save_owned_character_note')||sql.includes('archive_owned_character_note'))
   return {rows:[{id}]};
  return {rows:[{...row,content_rich:{type:'doc'},tab_name:'Diario'}]};
 }}});
 const body={tabName:'Diario',content:'Test',contentRich:{type:'doc'},
  position:2,hidden:true,visibility:'private'};
 const saved=await service.save(owner,campaign,character,id,body);
 assert.equal(saved.note.content_rich.type,'doc');
 assert.deepEqual(queryLog[0].params,[owner,campaign,character,id,'Diario','Test',
  '{"type":"doc"}',2,true,'private']);
 const archived=await service.archive(owner,campaign,character,id);
 assert.equal(archived.archivedId,id);
 assert.match(queryLog[2].sql,/archive_owned_character_note/);
 assert.doesNotMatch(queryLog[2].sql,/DELETE|TRUNCATE/);
 for(const bad of [{...body,ownerId:owner},{...body,contentRich:[]},
  {...body,position:-1},{...body,visibility:'public'},
  {...body,content:'x'.repeat(32769)}])
  await assert.rejects(()=>service.save(owner,campaign,character,id,bad));
});
test('unknown or forged notes fail closed without enumerating other owners',async()=>{
 const service=createEntityNotesService({pool:{query:async()=>({rows:[{id:null}]})}});
 await assert.rejects(()=>service.create(owner,campaign,character,{tabName:'Nota'}),e=>e.status===404);
 await assert.rejects(()=>service.save(owner,campaign,character,id,{tabName:'Nota',content:'',
  contentRich:null,position:0,hidden:false,visibility:'all'}),e=>e.status===404);
 await assert.rejects(()=>service.archive(owner,campaign,character,id),e=>e.status===404);
});

test('note subtabs remain isolated by parent with exact ID and ordered UUID validation',async()=>{
 const calls=[];
 const pool={query:async(sql,params)=>{
  calls.push({sql,params});
  if(sql.includes('create_owned_character_note_v2'))return {rows:[{id}]};
  if(sql.includes('set_owned_note_subtab_order'))return {rows:[{id}]};
  return {rows:[{...row,tab_position:2,parent_note_id:id,tab_order:[id]}]};
 }};
 const notes=createEntityNotesService({pool});
 const sub=await notes.create(owner,campaign,character,{tabName:'Sotto-tab',parentId:id});
 assert.equal(sub.note.id,id);
 assert.match(calls[0].sql,/create_owned_character_note_v2/);
 assert.deepEqual(calls[0].params,[owner,campaign,character,'Sotto-tab',id]);
 const nested=await notes.list(owner,campaign,character,id);
 assert.equal(nested.notes[0].parent_note_id,id);
 assert.equal(nested.notes[0].position,2);
 const order=await notes.setSubtabOrder(owner,campaign,character,id,[id]);
 assert.deepEqual(order,{parentId:id,tabOrder:[id]});
 await assert.rejects(()=>notes.create(owner,campaign,character,{tabName:'x',parentId:'bad'}));
 await assert.rejects(()=>notes.setSubtabOrder(owner,campaign,character,id,[id,id]));
 await assert.rejects(()=>notes.setSubtabOrder(owner,campaign,character,id,['invalid']));
});
