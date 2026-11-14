import {createCampaignSceneSession} from './campaign-scene-session.mjs';
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
/** Enforce server-verified membership and feature capability before opening a scene transport.
 * Aruba pilot bootstrap currently advertises gameSession=false, so this remains fail-closed
 * until the API and UI intentionally enable the capability together. */
export function createAuthorizedSceneSession({bootstrap,campaign,sceneId,origin,WebSocketImpl,PeerConnectionImpl,iceServers,onStatus,onScene}){
 if(!bootstrap||bootstrap.gameSessionEnabled!==true||!UUID.test(bootstrap.id??'')||
  !campaign||!UUID.test(campaign.id??'')||!UUID.test(campaign.ownerId??'')||!UUID.test(sceneId??'')||
  !Array.isArray(bootstrap.campaignMemberships)||
  !bootstrap.campaignMemberships.some(member=>member&&member.campaignId===campaign.id&&
   member.userId===bootstrap.id&&member.role===(campaign.ownerId===bootstrap.id?'gm':'player')))
  throw new Error('Aruba scene session not authorized');
 const role=campaign.ownerId===bootstrap.id?'host':'player';
 return createCampaignSceneSession({origin,campaignId:campaign.id,sceneId,role,
  WebSocketImpl,PeerConnectionImpl,iceServers,onStatus,onScene});
}
