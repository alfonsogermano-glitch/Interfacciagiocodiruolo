import test from 'node:test';
import assert from 'node:assert/strict';
import {createChapterService} from '../src/chapter-service.mjs';
const OWNER='971e26ae-eecb-4f37-ad03-56b0c3000789';
const OTHER='f14401d1-2d47-4d36-95be-458bc8fdcc21';
const CAMPAIGN='be2f1a87-b8ee-4b34-9da0-07efda11379a';
const CHAPTER='4b2c4c0b-4b67-45c2-901a-2b4d3f7c8c42';
const draft={id:CHAPTER,title:'Introduzione',description:'',notes:'',kind:'intro',isActive:true,nextChapterIds:[],mapUrl:null,mapMetadata:{},locationMetadata:{}};
test('chapter reads and writes check campaign ownership before touching chapter documents',async()=>{
 const queries=[];
 const pool={query:async(sql,args)=>{
  queries.push({sql,args});
  if(sql.includes('FROM hollowgate_vtt.campaigns'))return {rows:args[1]===OWNER?[{id:CAMPAIGN}]:[]};
  if(sql.includes('SELECT id,campaign_id,payload'))return {rows:[{id:CHAPTER,campaign_id:CAMPAIGN,payload:draft}]};
  if(sql.includes('INSERT INTO'))return {rows:[{id:CHAPTER}]};
  throw Error(sql);
 }};
 const service=createChapterService({pool});
 await assert.rejects(()=>service.list(OTHER,CAMPAIGN),e=>e.status===404);
 await assert.rejects(()=>service.save(OTHER,CAMPAIGN,draft),e=>e.status===404);
 assert.equal(queries.filter(q=>q.sql.includes('chapter_documents')).length,0);
 const listed=await service.list(OWNER,CAMPAIGN);
 assert.equal(listed.chapters[0].campaignId,CAMPAIGN);
 const saved=await service.save(OWNER,CAMPAIGN,draft);
 assert.equal(saved.chapter.id,CHAPTER);
 assert.equal(queries.filter(q=>q.sql.includes('chapter_documents')).length,2);
});
test('chapter writes reject client-supplied ownership before SQL',async()=>{
 const queries=[];
 const service=createChapterService({pool:{query:async(...args)=>{queries.push(args);return {rows:[]};}}});
 await assert.rejects(()=>service.save(OWNER,CAMPAIGN,{...draft,ownerId:OTHER}),e=>e.status===400);
 assert.equal(queries.length,0);
});
