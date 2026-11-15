import {CampaignRejected} from './campaign-service.mjs';
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const valid=id=>typeof id==='string'&&UUID.test(id);
export function createCharacterAssignmentService({pool}){
 if(typeof pool?.query!=='function')throw new TypeError('PostgreSQL pool required');
 return {
  async list(ownerId,campaignId){
   if(!valid(ownerId)||!valid(campaignId))throw new CampaignRejected('Campagna non valida',400);
   const {rows}=await pool.query(
    'SELECT * FROM hollowgate_vtt.list_owned_character_player_assignments($1,$2)',
    [ownerId,campaignId]);
   return {assignments:rows.map(row=>({characterId:row.character_id,playerId:row.player_id}))};
  },
  async set(ownerId,campaignId,characterId,playerId){
   if(!valid(ownerId)||!valid(campaignId)||!valid(characterId)||
      (playerId!==null&&!valid(playerId)))
    throw new CampaignRejected('Assegnazione non valida',400);
   const {rows}=await pool.query(
    'SELECT hollowgate_vtt.set_owned_character_player_assignment($1,$2,$3,$4) AS changed',
    [ownerId,campaignId,characterId,playerId]);
   if(rows[0]?.changed!==true)
    throw new CampaignRejected('Personaggio o giocatore non autorizzato',404);
   return {characterId,playerId};
  },
 };
}
