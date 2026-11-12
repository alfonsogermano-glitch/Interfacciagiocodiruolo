import {CampaignRejected} from './campaign-service.mjs';
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const map=row=>({
 id:row.id,campaignId:row.campaign_id,ownerId:row.owner_id,
 name:row.name,sheetData:row.sheet_data,status:row.status,
 createdAt:row.created_at,updatedAt:row.updated_at,
});
export function createPlayerCharacterService({pool}){
 if(typeof pool?.query!=='function')throw new TypeError('PostgreSQL pool required');
 return {
  async listCampaigns(playerId){
   if(typeof playerId!=='string'||!UUID.test(playerId))
    throw new CampaignRejected('Utente non valido',400);
   const {rows}=await pool.query(
    'SELECT * FROM hollowgate_vtt.list_joined_player_campaigns($1)',[playerId]);
   return {campaigns:rows.map(r=>({
    id:r.id,ownerId:r.owner_id,name:r.name,description:r.description,
    ruleset:r.ruleset,createdAt:r.created_at,
   }))};
  },
  async list(playerId,campaignId){
   if(typeof playerId!=='string'||!UUID.test(playerId)||
      typeof campaignId!=='string'||!UUID.test(campaignId))
    throw new CampaignRejected('Campagna non valida',400);
   // Only a DEFINER function checks the authenticated player and current
   // assignment. No browser-supplied ownerId, playerId, or table reads.
   const {rows}=await pool.query(
    'SELECT * FROM hollowgate_vtt.list_assigned_player_character_sheets($1,$2)',
    [playerId,campaignId]);
   return {characters:rows.map(map)};
  },
 };
}
