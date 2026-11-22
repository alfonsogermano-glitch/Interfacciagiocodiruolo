import {validateNarrativeContentDraft,NARRATIVE_KINDS,NarrativeContentRejected} from './narrative-content-contract.mjs';
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export function createNarrativeContentService({pool}){
 if(typeof pool?.query!=='function')throw new TypeError('PostgreSQL pool required');
 const kind=value=>{if(!NARRATIVE_KINDS.includes(value))throw new NarrativeContentRejected('Tipo contenuto non valido');return value;};
 const id=(value,label)=>{if(!UUID.test(value??''))throw new NarrativeContentRejected(label+' non valido');return value;};
 async function assertOwner(ownerId,campaignId){
  id(ownerId,'Utente');id(campaignId,'Campagna');
  const result=await pool.query('SELECT hollowgate_vtt.narrative_content_owner_authorized($1,$2) AS allowed',[ownerId,campaignId]);
  if(result.rows[0]?.allowed!==true)throw new NarrativeContentRejected('Campagna non autorizzata',404);
 }
 async function list(ownerId,campaignId,contentKind){
  contentKind=kind(contentKind);await assertOwner(ownerId,campaignId);
  const result=await pool.query('SELECT id,kind,campaign_id,payload FROM hollowgate_vtt.list_owned_narrative_content($1,$2,$3)',[ownerId,campaignId,contentKind]);
  return {items:result.rows.map(row=>({...row.payload,id:row.id,campaignId:row.campaign_id}))};
 }
 async function save(ownerId,campaignId,contentKind,draft){
  contentKind=kind(contentKind);const item=validateNarrativeContentDraft(campaignId,contentKind,draft);await assertOwner(ownerId,campaignId);
  const result=await pool.query('SELECT hollowgate_vtt.save_owned_narrative_content($1,$2,$3,$4,$5::jsonb) AS id',
   [ownerId,campaignId,contentKind,item.id,JSON.stringify(item)]);
  if(result.rows[0]?.id!==item.id)throw new Error('Narrative content write failed');
  return {item};
 }
 async function remove(ownerId,campaignId,contentKind,itemId){
  contentKind=kind(contentKind);id(itemId,'Contenuto');await assertOwner(ownerId,campaignId);
  const result=await pool.query('SELECT hollowgate_vtt.delete_owned_narrative_content($1,$2,$3,$4) AS id',[ownerId,campaignId,contentKind,itemId]);
  if(result.rows[0]?.id!==itemId)throw new NarrativeContentRejected('Contenuto non trovato',404);
  return {deleted:true};
 }
 return {list,save,remove};
}
