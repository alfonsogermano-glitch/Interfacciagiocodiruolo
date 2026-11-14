import {CampaignRejected} from './campaign-service.mjs';
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const uuid=(v)=>typeof v==='string'&&UUID.test(v);
export function createCharacterAvailabilityService({pool}){
 if(typeof pool?.query!=='function')throw new TypeError('PostgreSQL pool required');
 return {
  async list(userId,campaignId){
   if(!uuid(userId)||!uuid(campaignId))throw new CampaignRejected('Campagna non valida',400);
   const {rows}=await pool.query(
    'SELECT * FROM hollowgate_vtt.list_owned_character_availability($1,$2)',
    [userId,campaignId]);
   return {characters:rows.map(r=>({id:r.character_id,availableForPlayers:r.available_for_players}))};
  },
  async set(userId,campaignId,characterId,available){
   if(!uuid(userId)||!uuid(campaignId)||!uuid(characterId)||typeof available!=='boolean')
    throw new CampaignRejected('Disponibilità non valida',400);
   const {rows}=await pool.query(
    'SELECT hollowgate_vtt.set_owned_character_availability($1,$2,$3,$4) AS changed',
    [userId,campaignId,characterId,available]);
   if(rows[0]?.changed!==true)
    throw new CampaignRejected('Personaggio non trovato o non autorizzato',404);
   return {id:characterId,availableForPlayers:available};
  },
 };
}
