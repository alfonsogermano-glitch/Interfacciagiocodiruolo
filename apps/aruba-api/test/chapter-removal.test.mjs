import test from 'node:test';
import assert from 'node:assert/strict';
import {createChapterService} from '../src/chapter-service.mjs';
const OWNER='971e26ae-eecb-4f37-ad03-56b0c3000789';
const OTHER='f14401d1-2d47-4d36-95be-458bc8fdcc21';
const CAMPAIGN='be2f1a87-b8ee-4b34-9da0-07efda11379a';
const CHAPTER='4b2c4c0b-4b67-45c2-901a-2b4d3f7c8c42';
test('chapter removal checks campaign ownership and scopes DELETE to campaign',async()=>{
 const queries=[];
 const service=createChapterService({pool:{query:async(sql,args)=>{
  queries.push({sql,args});
  if(sql.includes('chapter_owner_authorized'))return {rows:args[0]===OWNER?[{allowed:true}]:[{allowed:false}]};
  if(sql.includes('delete_owned_chapter_document'))return {rows:[{id:CHAPTER}]};
  throw Error(sql);
 }}});
 await assert.rejects(()=>service.remove(OTHER,CAMPAIGN,CHAPTER),e=>e.status===404);
 assert.equal(queries.some(q=>q.sql.includes('delete_owned_chapter_document')),false);
 await assert.rejects(()=>service.remove(OWNER,CAMPAIGN,'invalid'),e=>e.status===400);
 assert.equal((await service.remove(OWNER,CAMPAIGN,CHAPTER)).deleted,true);
 const deletion=queries.find(q=>q.sql.includes('delete_owned_chapter_document'));
 assert.deepEqual(deletion.args,[OWNER,CAMPAIGN,CHAPTER]);
 assert.match(deletion.sql,/delete_owned_chapter_document/);
});
test('removing missing chapter returns 404',async()=>{
 const service=createChapterService({pool:{query:async(sql)=>{
  if(sql.includes('chapter_owner_authorized'))return {rows:[{allowed:true}]};
  return {rows:[]};
 }}});
 await assert.rejects(()=>service.remove(OWNER,CAMPAIGN,CHAPTER),e=>e.status===404);
});
