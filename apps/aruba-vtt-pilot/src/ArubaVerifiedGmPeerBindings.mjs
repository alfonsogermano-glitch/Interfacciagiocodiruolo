/**
 * GM-side session binding for the already verified Aruba WSS peer lifecycle.
 *
 * This is opt-in infrastructure, not mounted in the original VTT shell.
 * The caller must forward ONLY onVerifiedPeer/onPeerRevoked callbacks from
 * createArubaWebRtcSignalingClient and must supply the corresponding RTCDataChannel.
 * No message arriving on the channel may supply a user or campaign identity.
 *
 * Authenticated campaign authorization remains owned by GmHostEventRouter.
 * The WSS gateway independently revalidates membership and triggers revocation.
 */
import {attachVerifiedPlayerDataChannel} from './ArubaVerifiedDataChannelAdapter.mjs';

const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function createVerifiedGmPeerBindings({router,campaignId,onError=()=>{}}){
 if(typeof router?.attachVerifiedPlayer!=='function'||
  !UUID.test(campaignId)||typeof onError!=='function')
  throw new TypeError('Verified GM peer binding requires a campaign router');
 const proofs=new Map(),attached=new Map();
 let closed=false;
 const revoke=id=>{
  proofs.delete(id);
  const record=attached.get(id);
  if(!record)return;
  attached.delete(id);
  // Stop authorization before closing the transport. Old handles cannot
  // publish even if a queued onmessage callback executes after revocation.
  record.handle.disconnect();
  try{record.channel.close?.();}catch(error){onError(error);}
 };
 function verifiedPeer(proof){
  if(closed||!proof||!UUID.test(proof.peerId)||
    !UUID.test(proof.userId)||proof.campaignId!==campaignId)return false;
  const old=proofs.get(proof.peerId);
  if(old){
   // A duplicate notification must never silently swap an authenticated
   // identity while a channel for the previous one is still live.
   return old.userId===proof.userId;
  }
  proofs.set(proof.peerId,Object.freeze({userId:proof.userId,campaignId}));
  return true;
 }
 function attachChannel(peerId,channel){
  if(closed||!UUID.test(peerId)||!channel||attached.has(peerId))return false;
  const proof=proofs.get(peerId);
  if(!proof||channel.readyState!=='open')return false;
  const handle=attachVerifiedPlayerDataChannel({
   router,channel,peerId,authenticatedUserId:proof.userId,
   verifiedCampaignId:campaignId,onError,
  });
  if(!handle)return false;
  attached.set(peerId,{handle,channel});
  return true;
 }
 function peerRevoked(proof){
  if(closed||!proof||!UUID.test(proof.peerId))return;
  // A delayed revocation for an earlier identity must not remove the new
  // verified session. Peer IDs are WSS-generated and expected unique.
  const existing=proofs.get(proof.peerId);
  if(existing&&existing.userId===proof.userId&&proof.campaignId===campaignId)
   revoke(proof.peerId);
 }
 function close(){
  if(closed)return;
  closed=true;
  for(const id of [...attached.keys()])revoke(id);
  proofs.clear();
 }
 return Object.freeze({
  onVerifiedPeer:verifiedPeer,
  onPeerRevoked:peerRevoked,
  attachChannel,close,
  get verifiedCount(){return proofs.size;},
  get attachedCount(){return attached.size;},
 });
}
