import {CampaignRejected} from './campaign-service.mjs';

const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Server-only signaling identity gate. This is NOT an HTTP/WebSocket endpoint.
 * sessionToken must come from the verified cookie boundary, never the peer
 * envelope. Validate again on every connection/reconnection.
 * The campaign owner alone may host; an active member with role 'player'
 * may join. A second GM membership does not confer host ownership.
 */
export function createSignalingIdentityService({getSessionUser,pool,campaigns}){
 if(typeof getSessionUser!=='function'||typeof pool?.query!=='function'||
    typeof campaigns?.list!=='function')
  throw new TypeError('Authenticated session, database and campaigns required');
 return {
  async verify({sessionToken,campaignId,connectionRole}){
   if(typeof sessionToken!=='string'||!sessionToken||
      !UUID.test(campaignId??'')||
      !['host','player'].includes(connectionRole))
    throw new CampaignRejected('Connessione non valida',401);
   const user=await getSessionUser(sessionToken);
   if(!user||!UUID.test(user.id??''))
    throw new CampaignRejected('Sessione non valida',401);
   const {rows}=await pool.query(
    'SELECT hollowgate_vtt.campaign_member_role($1,$2) AS member_role',
    [user.id,campaignId]);
   const role=rows[0]?.member_role;
   if(connectionRole==='player'&&role!=='player')
    throw new CampaignRejected('Accesso alla campagna negato',403);
   if(connectionRole==='host'){
    if(role!=='gm')throw new CampaignRejected('Accesso alla campagna negato',403);
    // Campaign ownership is stronger than the generic GM membership role.
    const owned=await campaigns.list(user.id);
    if(!owned?.campaigns?.some(c=>c.id===campaignId&&c.ownerId===user.id))
     throw new CampaignRejected('Solo il proprietario puo ospitare',403);
   }
   return Object.freeze({userId:user.id,campaignId,
    role:connectionRole==='host'?'gm':'player'});
  },
 };
}
