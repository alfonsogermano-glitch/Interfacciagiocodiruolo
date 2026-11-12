import test from 'node:test';
import assert from 'node:assert/strict';
import {createCampaignNotesService} from '../src/campaign-notes-service.mjs';
const owner='971e26ae-eecb-4f37-ad03-56b0c3000789';
const campaign='be2f1a87-b8ee-4b34-9da0-07efda11379a';
const parent='aa2f1a87-b8ee-4b34-9da0-07efda11379a';
const child='bb2f1a87-b8ee-4b34-9da0-07efda11379a';
test('campaign note service delegates writes to per-member SQL authorization and separate note IDs',async()=>{
 const calls=[];
 const pool={query:async(sql,args)=>{
  calls.push({sql,args});
  if(sql.includes('create_member_campaign_note'))return {rows:[{id:child}]};
  if(sql.includes('list_member_campaign_notes_ui'))return {rows:[{
   id:child,title:'Pagina',parent_note_id:parent,content_rich:{type:'doc'},
   tab_position:2,visibility:'private',
  }]};
  return {rows:[{id:child}]};
 }};
 const notes=createCampaignNotesService({pool});
 const created=await notes.create(owner,campaign,{title:' Pagina ',parentId:parent});
 assert.equal(created.note.id,child);
 assert.deepEqual(calls[0].args,[owner,campaign,'Pagina',parent,null]);
 assert.deepEqual(calls[1].args,[owner,campaign,parent]);
 const saved=await notes.save(owner,campaign,child,{
  title:'Pagina',contentRich:{type:'doc',content:[]},position:2,visibility:'private',
 });
 assert.equal(saved.savedId,child);
 assert.equal(calls.length,3,'Child write cannot fetch the root list');
 assert.match(calls[2].sql,/save_member_campaign_note/);
 assert.deepEqual(calls[2].args.slice(0,3),[owner,campaign,child]);
 const archived=await notes.archive(owner,campaign,child);
 assert.equal(archived.archivedId,child);
 assert.match(calls[3].sql,/archive_member_campaign_note/);
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

test('member reads use the database membership and privacy gate, never owner-only list',async()=>{
 const member='cc2f1a87-b8ee-4b34-9da0-07efda11379a';
 const calls=[];
 const notes=createCampaignNotesService({pool:{query:async(sql,params)=>{
  calls.push([sql,params]);
  return {rows:[{id:child,title:'Condivisa',content_rich:{type:'doc'},
   parent_note_id:parent,tab_position:0,visibility:'all'}]};
 }}});
 const result=await notes.listForMember(member,campaign,parent);
 assert.deepEqual(result.notes,[{id:child,title:'Condivisa',contentRich:{type:'doc'},
  parentId:parent,position:0,visibility:'all',scope:'shared',folderId:null,
  creatorId:null,editorOwnerId:null,updatedAt:null,titleIcon:null,tabOrder:null}]);
 assert.match(calls[0][0],/list_member_campaign_notes/);
 assert.doesNotMatch(calls[0][0],/list_owned_campaign_notes/);
 assert.deepEqual(calls[0][1],[member,campaign,parent]);
 await assert.rejects(()=>notes.listForMember(member,campaign,'bad'),e=>e.status===400);
 assert.equal(calls.length,1,'Invalid parent must not query DB');
});

test('owner can create a GM container but not force GM scope onto a child',async()=>{
 const calls=[];
 const notes=createCampaignNotesService({pool:{query:async(sql,args)=>{
  calls.push([sql,args]);
  if(sql.includes('create_member_campaign_note'))return {rows:[{id:parent}]};
  return {rows:[{id:parent,title:'Segreto',content_rich:null,
   parent_note_id:null,tab_position:0,visibility:'private',scope:'gm',folder_id:null}]};
 }}});
 const created=await notes.create(owner,campaign,{title:'Segreto',parentId:null,scope:'gm'});
 assert.equal(created.note.scope,'gm');
 assert.match(calls[0][0],/create_member_campaign_note/);
 assert.deepEqual(calls[0][1],[owner,campaign,'Segreto',null,'gm']);
 assert.match(calls[1][0],/list_member_campaign_notes_ui/);
 await assert.rejects(()=>notes.create(owner,campaign,{title:'Figlio',parentId:parent,scope:'gm'}),e=>e.status===400);
 assert.equal(calls.length,2);
});
test('note folder move requires authenticated owner and database confirmation',async()=>{
 const calls=[];
 const notes=createCampaignNotesService({pool:{query:async(sql,args)=>{
  calls.push([sql,args]);return {rows:[{id:child}]};
 }}});
 assert.deepEqual(await notes.moveToFolder(owner,campaign,child,parent),
  {noteId:child,folderId:parent});
 assert.deepEqual(calls[0][1],[owner,campaign,child,parent]);
 assert.match(calls[0][0],/assign_member_campaign_note_folder/);
 await assert.rejects(()=>notes.moveToFolder(owner,campaign,child,'bad'),e=>e.status===400);
 const denied=createCampaignNotesService({pool:{query:async()=>({rows:[{id:null}]})}});
 await assert.rejects(()=>denied.moveToFolder(owner,campaign,child,parent),e=>e.status===404);
});

test('member role and author are never accepted as service payload fields',async()=>{
 const calls=[];
 const notes=createCampaignNotesService({pool:{query:async(sql,args)=>{
  calls.push([sql,args]);
  if(sql.includes('create_member_campaign_note'))return {rows:[{id:parent}]};
  return {rows:[{id:parent,title:'Nota',parent_note_id:null,
    content_rich:null,tab_position:0,visibility:'all',
    creator_id:owner,scope:'shared',folder_id:null}]};
 }}});
 await notes.create(owner,campaign,{title:'Nota',parentId:null});
 assert.match(calls[0][0],/create_member_campaign_note/);
 assert.deepEqual(calls[0][1],[owner,campaign,'Nota',null,'shared']);
 const before=calls.length;
 await assert.rejects(()=>notes.create(owner,campaign,
  {title:'Nota',parentId:null,creatorId:owner}),e=>e.status===400);
 await assert.rejects(()=>notes.create(owner,campaign,
  {title:'Nota',parentId:null,scope:'gm',role:'gm'}),e=>e.status===400);
 assert.equal(calls.length,before);
});

test('Note icons and persisted child order use member-scoped SQL and exact acknowledgements',async()=>{
 const calls=[];
 const noteId=parent;
 const notes=createCampaignNotesService({pool:{query:async(sql,args)=>{
  calls.push([sql,args]);return {rows:[{id:noteId}]};
 }}});
 assert.deepEqual(await notes.setTitleIcon(owner,campaign,noteId,'book-open'),
  {noteId,titleIcon:'book-open'});
 assert.match(calls[0][0],/set_member_campaign_note_title_icon/);
 assert.deepEqual(calls[0][1],[owner,campaign,noteId,'book-open']);
 assert.deepEqual(await notes.setSubtabOrder(owner,campaign,noteId,[child]),
  {noteId,tabOrder:[child]});
 assert.match(calls[1][0],/set_member_campaign_subtab_order/);
 assert.deepEqual(calls[1][1],[owner,campaign,noteId,JSON.stringify([child])]);
 await assert.rejects(()=>notes.setTitleIcon(owner,campaign,noteId,''),e=>e.status===400);
 await assert.rejects(()=>notes.setSubtabOrder(owner,campaign,noteId,[child,child]),e=>e.status===400);
 await assert.rejects(()=>notes.setSubtabOrder(owner,campaign,noteId,['invalid']),e=>e.status===400);
 assert.equal(calls.length,2);
 const deny=createCampaignNotesService({pool:{query:async()=>({rows:[{id:null}]})}});
 await assert.rejects(()=>deny.setTitleIcon(owner,campaign,noteId,null),e=>e.status===404);
 await assert.rejects(()=>deny.setSubtabOrder(owner,campaign,noteId,[child]),e=>e.status===404);
});

test('GM scope transitions use DB permission checks and exact acknowledgements',async()=>{
 const calls=[];
 const service=createCampaignNotesService({pool:{query:async(sql,args)=>{
  calls.push([sql,args]);return {rows:[{id:parent}]};
 }}});
 assert.deepEqual(await service.changeScope(owner,campaign,parent,'gm'),{noteId:parent,scope:'gm'});
 assert.match(calls[0][0],/move_gm_campaign_note_scope/);
 assert.deepEqual(calls[0][1],[owner,campaign,parent,'gm']);
 await assert.rejects(()=>service.changeScope(owner,campaign,parent,'invalid'),e=>e.status===400);
 assert.equal(calls.length,1);
 const denied=createCampaignNotesService({pool:{query:async()=>({rows:[{id:null}]})}});
 await assert.rejects(()=>denied.changeScope(owner,campaign,parent,'shared'),e=>e.status===404);
});
