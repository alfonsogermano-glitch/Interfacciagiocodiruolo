import {createCampaignSceneSession} from './campaign-scene-session.mjs';
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
/** Enforce server-verified membership and feature capability before opening a scene transport.
 * The bootstrap capability is opt-in and membership-scoped. The UI must still
 * explicitly request an authorized scene before any transport can open. */
export function createAuthorizedSceneSession({bootstrap,campaign,sceneId,origin,WebSocketImpl,PeerConnectionImpl,iceServers,onStatus,onScene}){
 if(!bootstrap||bootstrap.gameSessionEnabled!==true||!UUID.test(bootstrap.id??'')||
  !campaign||!UUID.test(campaign.id??'')||!UUID.test(campaign.ownerId??'')||!UUID.test(sceneId??'')||
  !Array.isArray(bootstrap.campaignMemberships)||
  bootstrap.campaignMemberships.filter(member=>member&&member.campaignId===campaign.id&&
   member.userId===bootstrap.id).length!==1||
  !bootstrap.campaignMemberships.some(member=>member&&member.campaignId===campaign.id&&
   member.userId===bootstrap.id&&member.role===(campaign.ownerId===bootstrap.id?'gm':'player')))
  throw new Error('Aruba scene session not authorized');
 const role=campaign.ownerId===bootstrap.id?'host':'player';
 return createCampaignSceneSession({origin,campaignId:campaign.id,sceneId,role,
  WebSocketImpl,PeerConnectionImpl,iceServers,onStatus,onScene});
}
