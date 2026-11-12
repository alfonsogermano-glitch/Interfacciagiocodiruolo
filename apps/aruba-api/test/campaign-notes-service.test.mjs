import test from 'node:test';
import assert from 'node:assert/strict';
import {createCampaignNotesService} from '../src/campaign-notes-service.mjs';
const owner='971e26ae-eecb-4f37-ad03-56b0c3000789';
const campaign='be2f1a87-b8ee-4b34-9da0-07efda11379a';
const parent='aa2f1a87-b8ee-4b34-9da0-07efda11379a';
const child='bb2f1a87-b8ee-4b34-9da0-07efda11379a';
test('campaign note service uses only owner-scoped routines and separate note IDs',async()=>{
 const calls=[];
 const pool={query:async(sql,args)=>{
  calls.push({sql,args});
  if(sql.includes('create_owned_campaign_note'))return {rows:[{id:child}]};
  if(sql.includes('list_owned_campaign_notes'))return {rows:[{
   id:child,title:'Pagina',parent_note_id:parent,content_rich:{type:'doc'},
   tab_position:2,visibility:'private',
  }]};
  return {rows:[{id:child}]};
 }};
 const notes=createCampaignNotesService({pool});
 const created=await notes.create(owner,campaign,{title:' Pagina ',parentId:parent});
 assert.equal(created.note.id,child);
 assert.deepEqual(calls[0].args,[owner,campaign,'Pagina',parent]);
 assert.deepEqual(calls[1].args,[owner,campaign,parent]);
 const saved=await notes.save(owner,campaign,child,{
  title:'Pagina',contentRich:{type:'doc',content:[]},position:2,visibility:'private',
 });
 assert.equal(saved.savedId,child);
 assert.equal(calls.length,3,'Child write cannot fetch the root list');
 assert.match(calls[2].sql,/save_owned_campaign_note/);
 assert.deepEqual(calls[2].args.slice(0,3),[owner,campaign,child]);
 const archived=await notes.archive(owner,campaign,child);
 assert.equal(archived.archivedId,child);
 assert.match(calls[3].sql,/archive_owned_campaign_note/);
});
test('campaign notes reject malformed identity, injected fields, oversized TipTap and failed SQL authorization',async()=>{
 const notes=createCampaignNotesService({pool:{query:async()=>({rows:[{id:null}]})}});
 await assert.rejects(()=>notes.list(owner,campaign,'bad'),e=>e.status===400);
 await assert.rejects(()=>notes.create(owner,campaign,{title:'Ok',parentId:null,ownerId:owner}),e=>e.status===400);
 await assert.rejects(()=>notes.create(owner,campaign,{title:'OK',parentId:null}),e=>e.status===404);
 const payload={title:'OK',contentRich:{type:'doc'},position:0,visibility:'private'};
 await assert.rejects(()=>notes.save(owner,campaign,child,{...payload,ownerId:owner}),e=>e.status===400);
 await assert.rejects(()=>notes.save(owner,campaign,child,{...payload,contentRich:{text:'x'.repeat(50000)}}),e=>e.status===400);
 await assert.rejects(()=>notes.save(owner,campaign,child,payload),e=>e.status===404);
 await assert.rejects(()=>notes.archive(owner,campaign,child),e=>e.status===404);
});
