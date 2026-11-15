import test from 'node:test';
import assert from 'node:assert/strict';
import {createCampaignFoldersService} from '../src/campaign-folders-service.mjs';
const owner='971e26ae-eecb-4f37-ad03-56b0c3000789';
const campaign='be2f1a87-b8ee-4b34-9da0-07efda11379a';
const folder='aa2f1a87-b8ee-4b34-9da0-07efda11379a';
test('member folder reads and owner writes call restricted PostgreSQL routines only',async()=>{
 const calls=[];
 const folders=createCampaignFoldersService({pool:{query:async(query,args)=>{
  calls.push([query,args]);
  return {rows:query.includes('list_member_note_folders')?
   [{id:folder,name:'Archivio',parent_folder_id:null,icon:null,
     folder_position:0,scope:'shared'}]:[{id:folder}]};
 }}});
 const listed=await folders.list(owner,campaign,'shared');
 assert.deepEqual(listed.folders,[{id:folder,name:'Archivio',parentId:null,
  icon:null,position:0,scope:'shared'}]);
 assert.match(calls[0][0],/list_member_note_folders/);
 assert.deepEqual(calls[0][1],[owner,campaign,'shared']);
 assert.equal((await folders.create(owner,{campaignId:campaign,
  scope:'shared',name:' Archivio ',parentId:null})).folderId,folder);
 assert.deepEqual(calls[1][1],[owner,campaign,'shared','Archivio',null]);
 assert.equal((await folders.update(owner,folder,{campaignId:campaign,
  name:'Rinominata',parentId:null})).folderId,folder);
 assert.deepEqual(calls[2][1],[owner,campaign,folder,'Rinominata',null]);
});
test('folder service refuses forged owner, scope, invalid parent and denied SQL writes',async()=>{
 let queries=0;
 const folders=createCampaignFoldersService({pool:{query:async()=>{queries++;return {rows:[{id:null}]}}}});
 await assert.rejects(()=>folders.list(owner,campaign,'private'),e=>e.status===400);
 await assert.rejects(()=>folders.create(owner,{campaignId:campaign,scope:'gm',
  name:'X',parentId:null,role:'gm'}),e=>e.status===400);
 await assert.rejects(()=>folders.create(owner,{campaignId:campaign,scope:'gm',
  name:'X',parentId:'bad'}),e=>e.status===400);
 await assert.rejects(()=>folders.update(owner,folder,{campaignId:campaign,
  name:'X',parentId:null,ownerId:owner}),e=>e.status===400);
 assert.equal(queries,0);
 await assert.rejects(()=>folders.create(owner,{campaignId:campaign,scope:'gm',
  name:'X',parentId:null}),e=>e.status===404);
 await assert.rejects(()=>folders.update(owner,folder,{campaignId:campaign,
  name:'X',parentId:null}),e=>e.status===404);
});

test('presentation and non-destructive archive enforce owner and explicit cascade',async()=>{
 const calls=[];
 const folders=createCampaignFoldersService({pool:{query:async(sql,args)=>{
  calls.push([sql,args]);return {rows:[{id:folder}]};
 }}});
 assert.deepEqual(await folders.presentation(owner,folder,
  {campaignId:campaign,icon:'book-open',position:12}),
  {folderId:folder,icon:'book-open',position:12});
 assert.match(calls[0][0],/set_owned_note_folder_presentation/);
 assert.deepEqual(calls[0][1],[owner,campaign,folder,'book-open',12]);
 assert.deepEqual(await folders.archive(owner,folder,{campaignId:campaign,cascade:false}),
  {archivedId:folder,cascade:false});
 assert.match(calls[1][0],/archive_owned_note_folder/);
 assert.deepEqual(calls[1][1],[owner,campaign,folder,false]);
 assert.deepEqual(await folders.archive(owner,folder,{campaignId:campaign,cascade:true}),
  {archivedId:folder,cascade:true});
 await assert.rejects(()=>folders.presentation(owner,folder,
  {campaignId:campaign,icon:'x',position:-1}),e=>e.status===400);
 await assert.rejects(()=>folders.presentation(owner,folder,
  {campaignId:campaign,icon:null,position:0,ownerId:owner}),e=>e.status===400);
 await assert.rejects(()=>folders.archive(owner,folder,
  {campaignId:campaign,cascade:'true'}),e=>e.status===400);
 await assert.rejects(()=>folders.archive(owner,folder,
  {campaignId:campaign,cascade:false,role:'gm'}),e=>e.status===400);
 assert.equal(calls.length,3,'Invalid requests must not reach PostgreSQL');
 const denied=createCampaignFoldersService({pool:{query:async()=>({rows:[{id:null}]})}});
 await assert.rejects(()=>denied.archive(owner,folder,
  {campaignId:campaign,cascade:false}),e=>e.status===404);
 await assert.rejects(()=>denied.presentation(owner,folder,
  {campaignId:campaign,icon:null,position:0}),e=>e.status===404);
});
