import test from 'node:test';
import assert from 'node:assert/strict';
import {createNarrativeEntityNotesService} from '../src/narrative-entity-notes-service.mjs';
const owner='971e26ae-eecb-4f37-ad03-56b0c3000789',campaign='be2f1a87-b8ee-4b34-9da0-07efda11379a';
const entity='ee2f1a87-b8ee-4b34-9da0-07efda11379a',id='aa2f1a87-b8ee-4b34-9da0-07efda11379a';
const row={id,tab_name:'Segreti',content:'',content_rich:null,tab_position:0,hidden:false,visibility:'private'};

test('narrative notes use exact owner campaign kind and entity SQL scope',async()=>{
 const calls=[];const notes=createNarrativeEntityNotesService({pool:{query:async(sql,params)=>{
  calls.push({sql,params});if(sql.includes('create_owned_narrative'))return {rows:[{id}]};return {rows:[row]};
 }}});
 const created=await notes.create(owner,campaign,'npcs',entity,{tabName:' Segreti '});
 assert.equal(created.note.id,id);
 assert.deepEqual(calls[0].params,[owner,campaign,'npcs',entity,'Segreti',null]);
 assert.deepEqual(calls[1].params,[owner,campaign,'npcs',entity,null]);
 await assert.rejects(()=>notes.list(owner,campaign,'events',entity));
 await assert.rejects(()=>notes.create(owner,campaign,'npcs',entity,{tabName:'x',ownerId:owner}));
});

test('narrative TipTap writes archive and order only through restricted routines',async()=>{
 const calls=[];const notes=createNarrativeEntityNotesService({pool:{query:async(sql,params)=>{calls.push({sql,params});return {rows:[{id}]};}}});
 const body={tabName:'Segreti',content:'Test',contentRich:{type:'doc'},position:1,hidden:true,visibility:'private'};
 const saved=await notes.save(owner,campaign,'monsters',entity,id,body);
 assert.equal(saved.note.content,'Test');assert.match(calls[0].sql,/save_owned_narrative_entity_note/);
 assert.deepEqual(calls[0].params,[owner,campaign,'monsters',entity,id,'Segreti','Test','{"type":"doc"}',1,true,'private']);
 assert.equal((await notes.archive(owner,campaign,'monsters',entity,id)).archivedId,id);
 assert.match(calls[1].sql,/archive_owned_narrative_entity_note/);
 assert.deepEqual(await notes.setSubtabOrder(owner,campaign,'monsters',entity,id,[id]),{parentId:id,tabOrder:[id]});
 assert.match(calls[2].sql,/set_owned_narrative_note_subtab_order/);
 await assert.rejects(()=>notes.setSubtabOrder(owner,campaign,'monsters',entity,id,[id,id]));
 await assert.rejects(()=>notes.save(owner,campaign,'monsters',entity,id,{...body,contentRich:[]}));
});
