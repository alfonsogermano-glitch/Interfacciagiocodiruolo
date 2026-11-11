import {CampaignRejected} from './campaign-service.mjs';
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const safeId=(id,kind)=>{if(typeof id!=='string'||!UUID.test(id))throw new CampaignRejected(kind+' non valido',400);return id;};
const mapped=row=>({
 id:row.id,campaignId:row.campaign_id,ownerId:row.owner_id,name:row.name,
 sheetData:row.sheet_data,status:row.status,createdAt:row.created_at,updatedAt:row.updated_at,
});
export function createCharacterService({pool}){
 if(typeof pool?.query!=='function')throw new TypeError('PostgreSQL pool required');
 async function list(ownerId,campaignId){
  safeId(ownerId,'Utente');safeId(campaignId,'Campagna');
  const {rows}=await pool.query('SELECT * FROM hollowgate_vtt.list_character_drafts($1,$2)',[ownerId,campaignId]);
  return {characters:rows.map(mapped)};
 }
 async function create(ownerId,campaignId,body){
  safeId(ownerId,'Utente');safeId(campaignId,'Campagna');
  if(!body||typeof body!=='object'||Array.isArray(body)||
   Object.keys(body).length!==1||typeof body.name!=='string'||
   body.name.trim().length<1||body.name.trim().length>120)
   throw new CampaignRejected('Nome personaggio non valido');
  const {rows}=await pool.query('SELECT hollowgate_vtt.create_character_draft($1,$2,$3) AS id',
   [ownerId,campaignId,body.name.trim()]);
  if(!rows[0]?.id)throw new CampaignRejected('Campagna non trovata o non autorizzata',404);
  const result=await list(ownerId,campaignId);
  const character=result.characters.find(item=>item.id===rows[0].id);
  if(!character)throw new Error('Character draft not visible');
  return {character};
 }
 return {list,create};
}
