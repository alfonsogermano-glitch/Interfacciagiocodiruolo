import test from 'node:test';
import assert from 'node:assert/strict';
import {createChapterService} from '../src/chapter-service.mjs';
const OWNER='971e26ae-eecb-4f37-ad03-56b0c3000789';
const CAMPAIGN='be2f1a87-b8ee-4b34-9da0-07efda11379a';
const CHAPTER='4b2c4c0b-4b67-45c2-901a-2b4d3f7c8c42';
const NEXT='f14401d1-2d47-4d36-95be-458bc8fdcc21';
const draft={id:CHAPTER,title:'Intro',description:'',notes:'',kind:'intro',isActive:true,nextChapterIds:[NEXT],mapUrl:null,mapMetadata:{},locationMetadata:{}};
test('chapter graph refuses cross-campaign or missing next chapter',async()=>{
 let writes=0;
 const service=createChapterService({pool:{query:async(sql)=>{
  if(sql.includes('chapter_owner_authorized'))return {rows:[{allowed:true}]};
  if(sql.includes('list_owned_chapter_links'))return {rows:[]};
  if(sql.includes('save_owned_chapter_document')){writes++;return {rows:[{id:CHAPTER}]};}
  throw Error(sql);
 }}});
 await assert.rejects(()=>service.save(OWNER,CAMPAIGN,draft),e=>e.status===400);
 assert.equal(writes,0);
});
test('chapter graph validates all linked IDs in same campaign',async()=>{
 const queries=[];
 const service=createChapterService({pool:{query:async(sql,args)=>{
  queries.push({sql,args});
  if(sql.includes('chapter_owner_authorized'))return {rows:[{allowed:true}]};
  if(sql.includes('list_owned_chapter_links'))return {rows:[{id:NEXT}]};
  if(sql.includes('save_owned_chapter_document'))return {rows:[{id:CHAPTER}]};
  throw Error(sql);
 }}});
 await service.save(OWNER,CAMPAIGN,draft);
 const check=queries.find(q=>q.sql.includes('list_owned_chapter_links'));
 assert.deepEqual(check.args,[OWNER,CAMPAIGN,[NEXT]]);
});
