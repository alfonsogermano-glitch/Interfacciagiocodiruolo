/** Build authenticated campaign memberships for the opt-in live-session
 * bootstrap. Owned campaigns become GM memberships; joined campaigns come
 * only from the assigned-player service and become player memberships. Every
 * row is rechecked against PostgreSQL immediately before publication. */
export function createGameSessionBootstrap({campaigns,playerCharacters=null,pool}){
 if(typeof campaigns?.list!=='function'||typeof pool?.query!=='function')
  throw new TypeError('Campaign and PostgreSQL services required');
 if(playerCharacters!==null&&typeof playerCharacters.listCampaigns!=='function')
  throw new TypeError('Player campaign service invalid');
 return async user=>{
  const owned=await campaigns.list(user.id);
  if(!Array.isArray(owned?.campaigns)||owned.campaigns.length>100)
   throw new Error('Invalid owned campaign list');
  const joined=playerCharacters?await playerCharacters.listCampaigns(user.id):{campaigns:[]};
  if(!Array.isArray(joined?.campaigns)||joined.campaigns.length>100)
   throw new Error('Invalid joined campaign list');
  const authorized=[
   ...owned.campaigns.map(campaign=>({campaign,expectedRole:'gm'})),
   ...joined.campaigns
    .filter(campaign=>!owned.campaigns.some(ownedCampaign=>ownedCampaign.id===campaign.id))
    .map(campaign=>({campaign,expectedRole:'player'})),
  ];
  if(authorized.length>100)throw new Error('Too many campaign memberships');
  const memberships=[];
  for(const {campaign,expectedRole} of authorized){
   if(!campaign||typeof campaign.id!=='string'||
      (expectedRole==='gm')!==(campaign.ownerId===user.id))
    throw new Error('Invalid campaign ownership');
   const result=await pool.query(
    'SELECT hollowgate_vtt.campaign_member_role($1,$2) AS member_role',
    [user.id,campaign.id]);
   if(result.rows[0]?.member_role!==expectedRole)
    throw new Error('Campaign membership changed');
   memberships.push({userId:user.id,campaignId:campaign.id,role:expectedRole});
  }
  return memberships;
 };
}
