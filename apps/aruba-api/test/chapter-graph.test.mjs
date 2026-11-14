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
  if(sql.includes('FROM hollowgate_vtt.campaigns'))return {rows:[{id:CAMPAIGN}]};
  if(sql.includes('id=ANY'))return {rows:[]};
  if(sql.includes('INSERT INTO')){writes++;return {rows:[{id:CHAPTER}]};}
  throw Error(sql);
 }}});
 await assert.rejects(()=>service.save(OWNER,CAMPAIGN,draft),e=>e.status===400);
 assert.equal(writes,0);
});
test('chapter graph validates all linked IDs in same campaign',async()=>{
 const queries=[];
 const service=createChapterService({pool:{query:async(sql,args)=>{
  queries.push({sql,args});
  if(sql.includes('FROM hollowgate_vtt.campaigns'))return {rows:[{id:CAMPAIGN}]};
  if(sql.includes('id=ANY'))return {rows:[{id:NEXT}]};
  if(sql.includes('INSERT INTO'))return {rows:[{id:CHAPTER}]};
  throw Error(sql);
 }}});
 await service.save(OWNER,CAMPAIGN,draft);
 const check=queries.find(q=>q.sql.includes('id=ANY'));
 assert.deepEqual(check.args,[CAMPAIGN,[NEXT]]);
});
