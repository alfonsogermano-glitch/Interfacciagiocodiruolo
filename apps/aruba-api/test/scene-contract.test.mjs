import test from 'node:test';
import assert from 'node:assert/strict';
import {validateSceneDraft} from '../src/scene-contract.mjs';
import {ChapterRejected} from '../src/chapter-contract.mjs';
const campaign='971e26ae-eecb-4f37-ad03-56b0c3000789';
const chapter='be2f1a87-b8ee-4b34-9da0-07efda11379a';
const id='4b2c4c0b-4b67-45c2-901a-2b4d3f7c8c42';
const base=()=>({id,chapterId:chapter,title:' Scena uno ',description:'',notes:'',status:'draft',imageUrl:null,sortOrder:0,nextSceneIds:[],mapRegions:[],contextMetadata:{timeOfDay:'',period:'',condition:''}});
test('original scene fields survive the Aruba boundary',()=>{
 const result=validateSceneDraft(campaign,base());
 assert.equal(result.campaignId,campaign);
 assert.equal(result.chapterId,chapter);
 assert.equal(result.title,'Scena uno');
 assert.equal(new Date(result.createdAt).toISOString(),result.createdAt);
 assert.equal(result.updatedAt,result.createdAt);
 assert.equal(Object.isFrozen(result),true);
});
test('scene boundary rejects forged campaign, malformed links and legacy storage URLs',()=>{
 for(const patch of [
  {campaignId:'00000000-0000-4000-8000-000000000000'},
  {chapterId:'bad'},{nextSceneIds:[id]},{nextSceneIds:['bad']},
  {status:'published'},{sortOrder:-1},{mapRegions:{}},
  {imageUrl:'https://project.supabase.co/storage/v1/object/public/scene.webp'},
  {ownerId:campaign},{createdAt:'yesterday'}
 ])assert.throws(()=>validateSceneDraft(campaign,{...base(),...patch}),ChapterRejected);
});
