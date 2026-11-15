import test from 'node:test';
import assert from 'node:assert/strict';
import {createSceneService} from '../src/scene-service.mjs';
const owner='971e26ae-eecb-4f37-ad03-56b0c3000789';
const campaign='be2f1a87-b8ee-4b34-9da0-07efda11379a';
const chapter='00000000-0000-4000-8000-000000000000';
const id='4b2c4c0b-4b67-45c2-901a-2b4d3f7c8c42';
const draft={id,chapterId:chapter,title:'Introduzione',description:'',notes:'',status:'draft',imageUrl:null,sortOrder:0,nextSceneIds:[],mapRegions:[],contextMetadata:{}};
test('scene service gates every operation by verified campaign ownership',async()=>{
 const calls=[];
 const pool={query:async(sql,args)=>{
  calls.push({sql,args});
  if(sql.includes('chapter_owner_authorized'))return {rows:[{allowed:args[0]===owner}]};
  if(sql.includes('list_owned_scene_documents'))return {rows:[{id,campaign_id:campaign,chapter_id:chapter,payload:draft}]};
  if(sql.includes('save_owned_scene_document'))return {rows:[{id}]};
  if(sql.includes('delete_owned_scene_document'))return {rows:[{id}]};
  throw Error(sql);
 }};
 const service=createSceneService({pool});
 await assert.rejects(()=>service.list('f14401d1-2d47-4d36-95be-458bc8fdcc21',campaign),e=>e.status===404);
 assert.equal(calls.length,1);
 assert.equal((await service.list(owner,campaign)).scenes[0].chapterId,chapter);
 assert.equal((await service.save(owner,campaign,draft)).scene.campaignId,campaign);
 assert.equal((await service.remove(owner,campaign,id)).deleted,true);
 assert.equal(calls.filter(c=>c.sql.includes('owned_scene_document')).length,3);
});
test('scene service rejects injected owner without database queries',async()=>{
 let queries=0;
 const service=createSceneService({pool:{query:async()=>{queries++;return {rows:[]};}}});
 await assert.rejects(()=>service.save(owner,campaign,{...draft,ownerId:owner}),e=>e.status===400);
 assert.equal(queries,0);
});
