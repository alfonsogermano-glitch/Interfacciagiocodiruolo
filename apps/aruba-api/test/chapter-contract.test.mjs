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
