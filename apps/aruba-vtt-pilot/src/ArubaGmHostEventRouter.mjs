import {isBroadcastEvent} from '../../../src/services/realtime/campaignChannelContract.ts';

/**
 * Transport-neutral GM-host event router, NOT a network listener.
 *
 * The caller MUST authenticate the GM and revalidate campaign membership
 * before calling openVerifiedHost/attachVerifiedPlayer; nothing received
 * from a WebRTC peer, websocket, querystring or browser profile can act
 * as trusted identity. The wire protocol will be implemented separately.
 * A GM remains the authority for all authoritative scene/map messages.
 */
const GM_ONLY=new Set([
 'INSERT','UPDATE','DELETE','session_change','active_scene_change',
 'active_scene_map_patch','members_change','notes_change','notification',
 'map_object_layer_action','map_object_drag_preview',
 'map_cone_direction_preview','map_history_action','character_owner_change',
]);
const PLAYER_CANDIDATES=new Set([
 'dice_roll','chat_message','chat_reaction','chat_delete',
 'map_measurement','map_token_action','map_poi_action',
]);
const CAMPAIGN_ID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_EVENT_BYTES=65536;

function frame(event,payload){
 if(!isBroadcastEvent(event)||!payload||Array.isArray(payload)||
   typeof payload!=='object')return null;
 let json;
 try{json=JSON.stringify({event,payload});}catch{return null;}
 if(!json||new TextEncoder().encode(json).byteLength>MAX_EVENT_BYTES)return null;
 // Data-only clone: strips functions/prototypes and prevents later mutation
 // by the caller from modifying a frame already in delivery.
 const result=JSON.parse(json);
 return result;
}
function safeDeliver(deliver,message,onDeliveryError){
 try{deliver(message);return true;}
 catch(error){onDeliveryError?.(error);return false;}
}

/**
 * attachVerifiedPlayer receives identity and membership exclusively from
 * the authenticated Aruba signaling layer, NEVER from the peer envelope.
 * This is deliberate fail-closed infrastructure: by default players cannot
 * publish even chat until the caller installs a per-message policy.
 */
export function createGmHostEventRouter({campaignId,gmUserId,
 authorizePlayerEvent=()=>false,onDeliveryError=()=>{}}){
 if(!CAMPAIGN_ID.test(campaignId)||!CAMPAIGN_ID.test(gmUserId)||
   typeof authorizePlayerEvent!=='function')
  throw new TypeError('Verified campaign, owner and authorization policy required');
 const peers=new Map();
 let host=null;
 let generation=0;
 const ensureHost=record=>host===record&&record?.generation===generation;
 const cleanup=()=>{
  generation+=1;
  peers.clear();
  host=null;
 };
 return {
  openVerifiedHost({authenticatedUserId,receiveFromPlayer}){
   if(authenticatedUserId!==gmUserId||typeof receiveFromPlayer!=='function'||
     host!==null)return null;
   const record={generation,receiveFromPlayer};
   host=record;
   return {
    publish(event,payload){
     if(!ensureHost(record))return false;
     const message=frame(event,payload);
     if(!message)return false;
     for(const peer of peers.values())safeDeliver(peer.receiveFromHost,
      {campaignId,event:message.event,payload:message.payload},
      onDeliveryError);
     return true;
    },
    disconnect(){if(ensureHost(record))cleanup();},
    get connectedPlayers(){return ensureHost(record)?peers.size:0;},
   };
  },
  attachVerifiedPlayer({peerId,authenticatedUserId,verifiedCampaignId,receiveFromHost}){
   if(!ensureHost(host)||typeof peerId!=='string'||!peerId.trim()||
     !CAMPAIGN_ID.test(authenticatedUserId)||authenticatedUserId===gmUserId||
     verifiedCampaignId!==campaignId||typeof receiveFromHost!=='function'||
     peers.has(peerId))return null;
   const record={authenticatedUserId,receiveFromHost,generation};
   peers.set(peerId,record);
   return {
    publish(event,payload){
     if(!ensureHost(host)||peers.get(peerId)!==record||
       record.generation!==generation||!PLAYER_CANDIDATES.has(event)||
       GM_ONLY.has(event))return false;
     const message=frame(event,payload);
     if(!message)return false;
     let allowed=false;
     try{
      allowed=authorizePlayerEvent({
       campaignId,userId:record.authenticatedUserId,
       event:message.event,payload:message.payload,
      })===true;
     }catch(error){onDeliveryError(error);return false;}
     if(!allowed)return false;
     return safeDeliver(host.receiveFromPlayer,{
      campaignId,fromUserId:record.authenticatedUserId,
      event:message.event,payload:message.payload,
     },onDeliveryError);
    },
    disconnect(){if(peers.get(peerId)===record)peers.delete(peerId);},
   };
  },
  close(){cleanup();},
  get hostOnline(){return host!==null;},
 };
}
