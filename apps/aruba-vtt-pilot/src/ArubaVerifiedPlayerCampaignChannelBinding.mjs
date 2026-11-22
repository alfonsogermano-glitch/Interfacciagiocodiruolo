import {isBroadcastEvent} from '../../../src/services/realtime/campaignChannelContract.ts';
import {installCampaignChannelTransport} from './ArubaCampaignChannelRuntime.mjs';

const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const PLAYER_SEND=new Set(['dice_roll','chat_message','chat_reaction','chat_delete','map_measurement','map_token_action','map_poi_action','map_object_layer_action']);
const HOST_RECEIVE=new Set(['active_scene_change','active_scene_map_patch','map_object_drag_preview','map_cone_direction_preview','map_history_action','dice_roll','chat_message','chat_reaction','chat_delete','map_measurement','notification','members_change','character_owner_change']);
const MAX=65536;
const encode=value=>{try{const text=JSON.stringify(value);return typeof text==='string'&&new TextEncoder().encode(text).length<=MAX?text:null;}catch{return null;}};

export function createVerifiedPlayerCampaignChannelBinding({campaignId,userId,ownerId,channel,onError=()=>{},onClosed=()=>{}}){
 if(!UUID.test(campaignId)||!UUID.test(userId)||!UUID.test(ownerId)||userId===ownerId||
  channel?.readyState!=='open'||typeof channel.addEventListener!=='function'||typeof channel.removeEventListener!=='function'||typeof channel.send!=='function'||typeof onClosed!=='function')
  throw new TypeError('Verified player campaign channel required');
 let closed=false,mapRevision=null;
 const runtime=installCampaignChannelTransport({campaignId,send:async(event,payload)=>{
  if(closed||channel.readyState!=='open'||!PLAYER_SEND.has(event))return false;
  const frame=encode({event,payload});if(!frame)return false;
  try{channel.send(frame);return true;}catch(error){onError(error);return false;}
 }});
 const onMessage=message=>{
  if(closed||channel.readyState!=='open'||typeof message?.data!=='string'||new TextEncoder().encode(message.data).length>MAX)return;
  let frame;try{frame=JSON.parse(message.data);}catch{return;}
  if(!frame||Array.isArray(frame)||typeof frame!=='object'||Object.keys(frame).sort().join(',')!=='event,payload'||
   !isBroadcastEvent(frame.event)||!HOST_RECEIVE.has(frame.event)||!frame.payload||typeof frame.payload!=='object'||Array.isArray(frame.payload))return;
  if(frame.event==='active_scene_change'){
   const next=frame.payload.arubaMapRevision;
   if(!Number.isSafeInteger(next)||next<1){close();return;}
   if(mapRevision!==null){
    if(next===mapRevision)return;
    if(!Number.isSafeInteger(mapRevision+1)||next!==mapRevision+1){close();return;}
   }
   mapRevision=next;
  }
  runtime.receive(frame.event,frame.payload);
 };
 const close=()=>{if(closed)return;closed=true;channel.removeEventListener('message',onMessage);channel.removeEventListener('close',close);channel.removeEventListener('error',close);runtime.setReady(false);runtime.close();try{onClosed();}catch(error){onError(error);}try{channel.close();}catch(error){onError(error);}};
 channel.addEventListener('message',onMessage);channel.addEventListener('close',close);channel.addEventListener('error',close);runtime.setReady(true);
 return Object.freeze({close});
}
