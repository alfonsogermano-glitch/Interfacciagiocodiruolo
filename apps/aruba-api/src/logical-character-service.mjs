import {CampaignRejected} from './campaign-service.mjs';
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const valid=value=>typeof value==='string'&&UUID.test(value);
const mapped=row=>({
 id:row.id,campaignId:row.campaign_id,ownerId:row.owner_id,logicalOwnerId:row.logical_owner_id,
 originalOwnerId:row.original_owner_id,claimableOrigin:row.claimable_origin,ruleset:row.ruleset,
 name:row.name,sheetData:row.sheet_data,status:row.status,availableForPlayers:row.available_for_players,
 createdAt:row.created_at,updatedAt:row.updated_at,
});
export function createLogicalCharacterService({pool}){
 if(typeof pool?.query!=='function')throw new TypeError('PostgreSQL pool required');
 async function list(ownerId,after=null){
  if(!valid(ownerId)||after!==null&&!valid(after))
   throw new CampaignRejected('Personaggio o campagna non valida',400);
  const {rows}=await pool.query('SELECT * FROM hollowgate_vtt.list_logical_owner_characters($1,$2)',[ownerId,after]);
  const page=rows.map(mapped);
  if(page.length>101)throw new Error('Invalid logical character result');
  const items=page.slice(0,100);
  return {characters:items,nextCursor:page.length>100?items[items.length-1].id:null};
 }
 async function assign(actorId,characterId,campaignId){
  if(!valid(actorId)||!valid(characterId)||campaignId!==null&&!valid(campaignId))
   throw new CampaignRejected('Assegnazione non valida',400);
  const {rows}=await pool.query('SELECT * FROM hollowgate_vtt.assign_logical_character_to_campaign($1,$2,$3)',
   [actorId,characterId,campaignId]);
  const row=rows[0];
  if(!row)throw new CampaignRejected('Personaggio non trovato',404);
  if(row.outcome==='not_found')throw new CampaignRejected('Personaggio o campagna non trovati',404);
  if(row.outcome==='forbidden')throw new CampaignRejected('Non hai i permessi su questo personaggio',403);
  if(row.outcome==='ruleset_mismatch')throw new CampaignRejected('Ruleset incompatibile con questa campagna',400);
  if(row.outcome!=='assigned'&&row.outcome!=='detached')
   throw new CampaignRejected('Assegnazione non disponibile',409);
  return {characterId,assignment:{outcome:row.outcome,campaignId:row.campaign_id,ruleset:row.ruleset}};
 }
 return {list,assign};
}
