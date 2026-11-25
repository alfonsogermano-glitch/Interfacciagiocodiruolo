import test from 'node:test';
import assert from 'node:assert/strict';
import {loadNarrativeDetail} from '../src/narrative-detail-loader.mjs';
const campaign='be2f1a87-b8ee-4b34-9da0-07efda11379a';
const id='4b2c4c0b-4b67-45c2-901a-2b4d3f7c8c42';
const item={id,campaignId:campaign,name:'Custode',chapterId:null};
const response=(data,status=200)=>({ok:status===200,status,json:async()=>data});
const fetcher=(entityResponse,chapterResponse)=>async url=>url.endsWith('/chapters')?chapterResponse:entityResponse;
test('PNG and Monsters remain readable with invalid chapter metadata, without accepting the metadata',async()=>{
 for(const kind of ['npcs','monsters']){
  const result=await loadNarrativeDetail(fetcher(response({items:[item]}),
   response({chapters:[{id,campaignId:campaign,title:'Incomplete migrated chapter'}]})),campaign,kind,id);
  assert.deepEqual(result.item,item);
  assert.deepEqual(result.chapters,[]);
  assert.equal(result.placementAvailable,false);
  assert.match(result.chapterWarning,/collegamenti ai capitoli non sono modificabili/);
 }
});
test('valid empty chapter collection is not mislabeled as a chapter failure',async()=>{
 const result=await loadNarrativeDetail(fetcher(response({items:[item]}),response({chapters:[]})),campaign,'npcs',id);
 assert.equal(result.placementAvailable,true);
 assert.equal(result.chapterWarning,null);
});
test('expired chapter session revokes the whole detail instead of using partial data',async()=>{
 await assert.rejects(()=>loadNarrativeDetail(fetcher(response({items:[item]}),response({},401)),
  campaign,'npcs',id),/Sessione scaduta/);
});
test('unauthorized, missing and cross-campaign entities never fall back to chapter data',async()=>{
 for(const entityResponse of [
  response({},401),response({},404),response({items:[]}),
  response({items:[{...item,campaignId:'00000000-0000-4000-8000-000000000000'}]}),
 ]){
  await assert.rejects(()=>loadNarrativeDetail(fetcher(entityResponse,response({chapters:[]})),campaign,'npcs',id));
 }
});
test('recovery placeholders are identified explicitly and never treated as complete sheet models',async()=>{
 const placeholder={id,campaignId:campaign,recoveredPlaceholder:true,title:'[Recupero] monster'};
 await assert.rejects(()=>loadNarrativeDetail(fetcher(response({items:[placeholder]}),response({chapters:[]})),
  campaign,'monsters',id),/Segnaposto tecnico/);
});
