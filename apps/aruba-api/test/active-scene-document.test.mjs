import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {validateCampaignDocumentIdentity,validateCampaignDocumentValue} from '../src/campaign-document-contract.mjs';
const campaignId='00000000-0000-4000-8000-000000000001';

test('active scene is an explicit bounded Aruba campaign document',()=>{
 assert.equal(validateCampaignDocumentIdentity(campaignId,'active-scene'),'active-scene');
 const value={id:'scene:00000000-0000-4000-8000-000000000002',campaignId,
  sceneId:'00000000-0000-4000-8000-000000000002',chapterId:'00000000-0000-4000-8000-000000000003',
  title:'Atrio',description:'',chapterTitle:'Ingresso',mapUrl:null,sceneImageUrl:null,
  mapMetadata:{},mapRegions:[],contextMetadata:{},publishedAt:'2026-11-16T12:00:00.000Z'};
 assert.deepEqual(validateCampaignDocumentValue(campaignId,'active-scene',value),value);
 assert.throws(()=>validateCampaignDocumentValue(campaignId,'active-scene',{...value,mapUrl:'https://legacy.supabase.co/map.png'}),/legacy/);
});

test('original SessionWorkspace map documents are accepted under their real keys',()=>{
 for(const key of ['session-map-placements','session-map-grids','session-map-tokens','session-map-drawings','session-map-pois','session-map-fog','session-map-object-order']){
  assert.equal(validateCampaignDocumentIdentity(campaignId,key),key);
  assert.deepEqual(validateCampaignDocumentValue(campaignId,key,{}),{});
 }
 assert.throws(()=>validateCampaignDocumentIdentity(campaignId,'session-map-unknown'),/Documento campagna non valido/);
 assert.throws(()=>validateCampaignDocumentIdentity(campaignId,'map-grids'),/Documento campagna non valido/);
});

test('campaign document SQL migration accepts every SessionWorkspace key',()=>{
 const sql=readFileSync(fileURLToPath(new URL('../../../deploy/aruba/sql/campaign-documents/002_session_document_keys.sql',import.meta.url)),'utf8');
 for(const key of ['active-scene','session-map-placements','session-map-grids','session-map-tokens','session-map-drawings','session-map-pois','session-map-fog','session-map-object-order'])
  assert.match(sql,new RegExp(`'${key}'`),`SQL migration missing ${key}`);
 assert.match(sql,/CREATE OR REPLACE FUNCTION hollowgate_vtt[.]save_owned_campaign_document/);
});
