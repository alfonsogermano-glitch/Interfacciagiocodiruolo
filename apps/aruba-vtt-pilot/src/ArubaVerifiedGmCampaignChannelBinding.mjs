import {installCampaignChannelTransport} from './ArubaCampaignChannelRuntime.mjs';
import {createGmHostEventRouter} from './ArubaGmHostEventRouter.mjs';
import {createVerifiedGmPeerBindings} from './ArubaVerifiedGmPeerBindings.mjs';

/** Composes only pre-verified identities and existing per-event policies.
 * It does not inspect wire identity and cannot become ready without an open,
 * server-proven player DataChannel attached by VerifiedGmPeerBindings. */
export function createVerifiedGmCampaignChannelBinding({campaignId,gmUserId,
 authorizePlayerEvent,authorizeHostEvent,onError=()=>{},loadSnapshot,projectVisibleSnapshot,
 receivePlayerEvent}){
 if(typeof authorizePlayerEvent!=='function'||typeof authorizeHostEvent!=='function')
  throw new TypeError('Explicit GM/player campaign policies required');
 if(receivePlayerEvent!==undefined&&typeof receivePlayerEvent!=='function')
  throw new TypeError('Player event receiver must be a function');
 let closed=false,mapRevision=0;
 const publish=(event,payload)=>{
  if(closed)return false;
  if(event!=='active_scene_change')return host.publish(event,payload);
  if(!Number.isSafeInteger(mapRevision+1))return false;
  const next=mapRevision+1;
  const accepted=host.publish(event,{...payload,arubaMapRevision:next});
  if(accepted)mapRevision=next;
  return accepted;
 };
 const runtime=installCampaignChannelTransport({campaignId,send:async(event,payload)=>
  publish(event,payload)});
 const router=createGmHostEventRouter({campaignId,gmUserId,authorizePlayerEvent,authorizeHostEvent,onDeliveryError:onError});
 const host=router.openVerifiedHost({authenticatedUserId:gmUserId,receiveFromPlayer:message=>{
  if(closed)return false;
  return receivePlayerEvent?receivePlayerEvent(message,runtime):runtime.receive(message.event,message.payload);
 }});
 if(!host){runtime.close();router.close();throw new Error('Verified GM host unavailable');}
 const peers=createVerifiedGmPeerBindings({router,campaignId,onError,loadSnapshot,projectVisibleSnapshot,
  onAttachedCountChange:count=>runtime.setReady(!closed&&count>0)});
 return Object.freeze({
  onVerifiedPeer:peers.onVerifiedPeer,onPeerRevoked:peers.onPeerRevoked,attachChannel:peers.attachChannel,
  publishHostEvent:publish,
  close(){if(closed)return;closed=true;runtime.setReady(false);peers.close();host.disconnect();router.close();runtime.close();},
  get attachedCount(){return peers.attachedCount;},
  hasAttachedUser:userId=>peers.hasAttachedUser(userId),
 });
}
