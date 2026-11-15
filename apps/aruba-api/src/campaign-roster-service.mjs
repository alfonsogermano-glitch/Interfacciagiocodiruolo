import {CampaignRejected} from './campaign-service.mjs';
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export function createCampaignRosterService({pool}){
 if(typeof pool?.query!=='function')throw new TypeError('PostgreSQL pool required');
 return {
  async list(ownerId,campaignId){
   if(!UUID.test(ownerId??'')||!UUID.test(campaignId??''))
    throw new CampaignRejected('Campagna non valida',400);
   // The SQL function accepts the authenticated owner only; it never
   // receives a caller-supplied owner from query parameters or JSON.
   const {rows}=await pool.query(
    'SELECT * FROM hollowgate_vtt.list_owned_campaign_roster($1,$2)',
    [ownerId,campaignId]);
   if(!rows.length)throw new CampaignRejected('Campagna non trovata',404);
   return {members:rows.map(r=>({
    userId:r.user_id,displayName:r.display_name,role:r.member_role,
    joinedAt:r.joined_at,
   }))};
  }
 };
}
