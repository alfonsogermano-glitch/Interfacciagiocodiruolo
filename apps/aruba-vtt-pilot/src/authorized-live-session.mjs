/** Fail-closed bridge from authenticated Aruba bootstrap to the browser live session.
 * No direct caller may turn on multiplayer by passing an arbitrary role. */
import {createCampaignLiveSession} from './campaign-live-session.mjs';
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export function createAuthorizedLiveSession({bootstrap,campaign,origin,WebSocketImpl,PeerConnectionImpl,iceServers,onStatus,onSnapshot}){
 if(!bootstrap||bootstrap.gameSessionEnabled!==true||!UUID.test(bootstrap.id??'')||
    !campaign||!UUID.test(campaign.id??'')||!UUID.test(campaign.ownerId??'')||
    !Array.isArray(bootstrap.campaigns)||!bootstrap.campaigns.some(item=>item.id===campaign.id))
  throw new Error('Aruba live session not authorized');
 // The GM is the sole authoritative host. Players require a verified membership
 // in the authenticated bootstrap; the signaling gateway rechecks membership.
 const role=campaign.ownerId===bootstrap.id?'host':'player';
 return createCampaignLiveSession({origin,campaignId:campaign.id,role,
  WebSocketImpl,PeerConnectionImpl,iceServers,onStatus,onSnapshot});
}
