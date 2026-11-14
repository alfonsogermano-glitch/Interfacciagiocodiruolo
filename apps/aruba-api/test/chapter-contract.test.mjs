import test from 'node:test';
import assert from 'node:assert/strict';
import {validateChapterDraft,ChapterRejected} from '../src/chapter-contract.mjs';
const CAMPAIGN='971e26ae-eecb-4f37-ad03-56b0c3000789';
const CHAPTER='be2f1a87-b8ee-4b34-9da0-07efda11379a';
const base=()=>({id:CHAPTER,title:' Inizio ',description:'',notes:'',kind:'intro',isActive:true,nextChapterIds:[],mapUrl:null,mapMetadata:{},locationMetadata:{}});
test('chapter model is campaign-scoped and never trusts a client-supplied campaignId',()=>{
 const result=validateChapterDraft(CAMPAIGN,base());
 assert.equal(result.campaignId,CAMPAIGN);
 assert.equal(result.title,'Inizio');
 assert.equal(Object.isFrozen(result),true);
 assert.throws(()=>validateChapterDraft(CAMPAIGN,{...base(),campaignId:CAMPAIGN}),ChapterRejected);
 assert.throws(()=>validateChapterDraft('invalid',base()),ChapterRejected);
});
test('chapter model rejects malformed or unsafe graph and payloads',()=>{
 for(const patch of [
 {id:'bad'},{title:' '},{kind:'other'},{isActive:'yes'},
 {nextChapterIds:[CHAPTER]},{nextChapterIds:['invalid']},
 {nextChapterIds:['a0bd28df-49e8-440a-9d42-8749df4b76b3','a0bd28df-49e8-440a-9d42-8749df4b76b3']},
 {mapUrl:42},{mapMetadata:[]},{locationMetadata:null},{ownerId:CAMPAIGN},
 ]){
  assert.throws(()=>validateChapterDraft(CAMPAIGN,{...base(),...patch}),ChapterRejected);
 }
});

test('original Chapter timestamps survive Aruba validation unchanged',()=>{
 const createdAt='2026-01-02T03:04:05.000Z';
 const updatedAt='2026-01-03T03:04:05.000Z';
 const result=validateChapterDraft(CAMPAIGN,{...base(),createdAt,updatedAt});
 assert.equal(result.createdAt,createdAt);
 assert.equal(result.updatedAt,updatedAt);
 for(const bad of ['yesterday','2026-02-30T03:04:05.000Z',null,42])
  assert.throws(()=>validateChapterDraft(CAMPAIGN,{...base(),createdAt:bad}),ChapterRejected);
});

test('chapter map references cannot silently retain the retired Supabase host',()=>{
 for(const mapUrl of [
  'https://old-project.supabase.co/storage/v1/object/public/visual-assets/map.webp',
  'https://old-project.supabase.in/storage/v1/object/public/map.webp',
 ]){
  assert.throws(()=>validateChapterDraft(CAMPAIGN,{...base(),mapUrl}),ChapterRejected);
 }
 assert.equal(validateChapterDraft(CAMPAIGN,{...base(),mapUrl:'/assets/maps/chapter.webp'}).mapUrl,'/assets/maps/chapter.webp');
});

test('chapter save contract always returns timestamps required by Aruba frontend',()=>{
 const result=validateChapterDraft(CAMPAIGN,base());
 assert.equal(new Date(result.createdAt).toISOString(),result.createdAt);
 assert.equal(result.updatedAt,result.createdAt);
 const original='2026-01-02T03:04:05.000Z';
 const withCreation=validateChapterDraft(CAMPAIGN,{...base(),createdAt:original});
 assert.equal(withCreation.createdAt,original);
 assert.equal(withCreation.updatedAt,original);
});
