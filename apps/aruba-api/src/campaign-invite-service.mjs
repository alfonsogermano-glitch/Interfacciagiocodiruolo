import {createHash,randomBytes} from 'node:crypto';
import {CampaignRejected} from './campaign-service.mjs';

const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const CODE=/^HG-[A-F0-9]{20}$/;
const digest=code=>createHash('sha256').update(code,'ascii').digest();
const identity=value=>{
 if(typeof value!=='string'||!UUID.test(value))throw new CampaignRejected('Utente non valido',401);
 return value;
};
const inviteCode=value=>{
 if(typeof value!=='string')throw new CampaignRejected('Codice invito non valido',400);
 const code=value.trim().toUpperCase();
 if(!CODE.test(code))throw new CampaignRejected('Codice invito non valido',400);
 return code;
};
const campaign=row=>({
 id:row.id,ownerId:row.owner_id,name:row.name,description:row.description,
 ruleset:row.ruleset,createdAt:row.created_at,
});

export function createCampaignInviteService({pool,now=()=>new Date(),random=randomBytes}){
 if(typeof pool?.query!=='function')throw new TypeError('PostgreSQL pool required');
 return {
  async rotate(ownerId,campaignId){
   const owner=identity(ownerId);
   if(typeof campaignId!=='string'||!UUID.test(campaignId))
    throw new CampaignRejected('Campagna non valida',400);
   const code='HG-'+random(10).toString('hex').toUpperCase();
   if(!CODE.test(code))throw new Error('Invite entropy source failed');
   const expiresAt=new Date(now().getTime()+7*24*60*60*1000);
   const {rows}=await pool.query(
    'SELECT hollowgate_vtt.rotate_owned_campaign_invite($1,$2,$3,$4) AS campaign_id',
    [owner,campaignId,digest(code),expiresAt]);
   if(rows[0]?.campaign_id!==campaignId)throw new CampaignRejected('Campagna non trovata',404);
   return {invite:{campaignId,code,expiresAt:expiresAt.toISOString()}};
  },
  async preview(userId,codeValue){
   const user=identity(userId),code=inviteCode(codeValue);
   const {rows}=await pool.query(
    'SELECT * FROM hollowgate_vtt.preview_campaign_invite($1,$2)',[user,digest(code)]);
   if(!rows[0])throw new CampaignRejected('Codice invito non valido o scaduto',404);
   return {campaign:campaign(rows[0])};
  },
  async join(userId,codeValue){
   const user=identity(userId),code=inviteCode(codeValue);
   const {rows}=await pool.query(
    'SELECT * FROM hollowgate_vtt.join_campaign_by_invite($1,$2)',[user,digest(code)]);
   if(!rows[0])throw new CampaignRejected('Codice invito non valido o scaduto',404);
   return {campaign:campaign(rows[0])};
  },
 };
}
