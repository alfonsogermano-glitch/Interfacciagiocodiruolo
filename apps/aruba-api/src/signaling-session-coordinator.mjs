import {createGmHostEventRouter} from '../../aruba-vtt-pilot/src/ArubaGmHostEventRouter.mjs';

// This is an in-process adapter, not a network listener. Only the trusted
// cookie boundary may supply sessionToken. Player/host identities are resolved
// by the Aruba session and PostgreSQL role gate, never by peer messages.
//
// Visibility is intentionally deny-by-default. The eventual network listener
// must provide audited event-specific policies and sanitize GM-only fields.
export function createSignalingSessionCoordinator({
 identity,authorizePlayerEvent=()=>false,authorizeHostEvent=()=>false,
 onDeliveryError=()=>{},
}){
 if(typeof identity?.verify!=='function'||
    typeof authorizePlayerEvent!=='function'||
    typeof authorizeHostEvent!=='function'||
    typeof onDeliveryError!=='function')
  throw new TypeError('Verified identity and authorization functions required');
 const rooms=new Map();
 return {
  async openHost({sessionToken,campaignId,receiveFromPlayer}){
   if(typeof receiveFromPlayer!=='function')return null;
   const proof=await identity.verify({sessionToken,campaignId,connectionRole:'host'});
   if(proof?.role!=='gm'||proof.campaignId!==campaignId||!proof.userId||
      rooms.has(campaignId))return null;
   const router=createGmHostEventRouter({
    campaignId,gmUserId:proof.userId,
    authorizePlayerEvent,authorizeHostEvent,onDeliveryError,
   });
   const room={router,players:new Map(),token:sessionToken,owner:proof.userId};
   const host=router.openVerifiedHost({
    authenticatedUserId:proof.userId,receiveFromPlayer,
   });
   if(!host)return null;
   rooms.set(campaignId,room);
   let active=true;
   return Object.freeze({
    async publish(event,payload){
     if(!active||rooms.get(campaignId)!==room)return false;
     // Host identity is checked for every outbound event, not just at join.
     let verified;
     try{
      verified=await identity.verify({
       sessionToken:room.token,campaignId,connectionRole:'host',
      });
     }catch{
      if(rooms.get(campaignId)===room){router.close();rooms.delete(campaignId);}
      active=false;return false;
     }
     if(!active||rooms.get(campaignId)!==room||
        verified.userId!==room.owner||verified.role!=='gm')return false;
     // Fresh DB membership for each player before GM deliveries. A revoked
     // member must never receive an event because its old peer stayed open.
     for(const [peerId,peer] of room.players){
      let valid=false;
      try{
       const membership=await identity.verify({
        sessionToken:peer.token,campaignId,connectionRole:'player',
       });
       valid=membership.userId===peer.userId&&
        membership.campaignId===campaignId&&membership.role==='player';
      }catch{}
      if(!valid){
       peer.connection.disconnect();
       room.players.delete(peerId);
      }
      if(!active||rooms.get(campaignId)!==room)return false;
     }
     return host.publish(event,payload);
    },
    disconnect(){
     if(!active)return;
     active=false;
     if(rooms.get(campaignId)===room){
      router.close();
      rooms.delete(campaignId);
     }
    },
    get connectedPlayers(){return active?host.connectedPlayers:0;},
   });
  },
  async joinPlayer({sessionToken,campaignId,peerId,receiveFromHost}){
   if(typeof peerId!=='string'||!peerId.trim()||
      typeof receiveFromHost!=='function')return null;
   const room=rooms.get(campaignId);
   if(!room)return null;
   const proof=await identity.verify({sessionToken,campaignId,connectionRole:'player'});
   if(rooms.get(campaignId)!==room||proof?.role!=='player'||
      proof.campaignId!==campaignId||!proof.userId||
      room.players.has(peerId))return null;
   const connection=room.router.attachVerifiedPlayer({
    peerId,authenticatedUserId:proof.userId,verifiedCampaignId:campaignId,
    receiveFromHost,
   });
   if(!connection)return null;
   const peer={connection,token:sessionToken,userId:proof.userId};
   room.players.set(peerId,peer);
   let active=true;
   return Object.freeze({
    async publish(event,payload){
     if(!active||rooms.get(campaignId)!==room||
        room.players.get(peerId)!==peer)return false;
     try{
      const current=await identity.verify({
       sessionToken:peer.token,campaignId,connectionRole:'player',
      });
      if(current.userId!==peer.userId||current.role!=='player'||
         current.campaignId!==campaignId)throw new Error('Membership changed');
     }catch{
      if(room.players.get(peerId)===peer){
       connection.disconnect();room.players.delete(peerId);
      }
      active=false;return false;
     }
     if(!active||rooms.get(campaignId)!==room||
        room.players.get(peerId)!==peer)return false;
     return connection.publish(event,payload);
    },
    disconnect(){
     if(!active)return;
     active=false;
     if(room.players.get(peerId)===peer){
      connection.disconnect();room.players.delete(peerId);
     }
    },
   });
  },
  close(){
   for(const room of rooms.values())room.router.close();
   rooms.clear();
  },
 };
}
