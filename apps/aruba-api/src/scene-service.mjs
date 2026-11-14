import {validateSceneDraft} from './scene-contract.mjs';
import {ChapterRejected} from './chapter-contract.mjs';
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export function createSceneService({pool}){
 if(typeof pool?.query!=='function')throw new TypeError('PostgreSQL pool required');
 async function assertOwner(ownerId,campaignId){
  if(!UUID.test(ownerId??'')||!UUID.test(campaignId??''))throw new ChapterRejected('Identificativo non valido');
  const result=await pool.query('SELECT hollowgate_vtt.chapter_owner_authorized($1,$2) AS allowed',[ownerId,campaignId]);
  if(result.rows[0]?.allowed!==true)throw new ChapterRejected('Campagna non autorizzata',404);
 }
 async function list(ownerId,campaignId){
  await assertOwner(ownerId,campaignId);
  const result=await pool.query('SELECT id,campaign_id,chapter_id,payload FROM hollowgate_vtt.list_owned_scene_documents($1,$2)',[ownerId,campaignId]);
  return {scenes:result.rows.map(row=>({...row.payload,id:row.id,campaignId:row.campaign_id,chapterId:row.chapter_id}))};
 }
 async function save(ownerId,campaignId,draft){
  const scene=validateSceneDraft(campaignId,draft);
  await assertOwner(ownerId,campaignId);
  const result=await pool.query('SELECT hollowgate_vtt.save_owned_scene_document($1,$2,$3,$4,$5::jsonb) AS id',[ownerId,campaignId,scene.id,scene.chapterId,JSON.stringify(scene)]);
  if(result.rows[0]?.id!==scene.id)throw new ChapterRejected('Capitolo della scena non valido',400);
  return {scene};
 }
 async function remove(ownerId,campaignId,sceneId){
  if(!UUID.test(sceneId??''))throw new ChapterRejected('Scena non valida');
  await assertOwner(ownerId,campaignId);
  const result=await pool.query('SELECT hollowgate_vtt.delete_owned_scene_document($1,$2,$3) AS id',[ownerId,campaignId,sceneId]);
  if(result.rows[0]?.id!==sceneId)throw new ChapterRejected('Scena non trovata',404);
  return {deleted:true};
 }
 return {list,save,remove};
}
