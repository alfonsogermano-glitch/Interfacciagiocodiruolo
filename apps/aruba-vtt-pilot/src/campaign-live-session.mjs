import {createWebRtcSession} from './webrtc-session.mjs';
import {createGameStateReplicator} from './game-state-replicator.mjs';
/** Explicitly opt-in GM-hosted session transport. No UI or bootstrap capability bypass. */
export function createCampaignLiveSession({origin,campaignId,role,WebSocketImpl,PeerConnectionImpl,iceServers=[],onStatus=()=>{},onSnapshot=()=>{}}){
 let stopped=false;
 // The signaling client may synchronously deliver status during construction;
 // defer any refresh request until a channel is actually open.
 let replicator;
 const transport=createWebRtcSession({origin,campaignId,role,WebSocketImpl,PeerConnectionImpl,iceServers,
  onStatus:event=>{
   if(stopped)return;
   if(event.state==='connected'&&role==='player')replicator?.requestSnapshot();
   if(event.state==='connected'&&role==='host')replicator?.receive({peerId:event.peerId,payload:{kind:'request-snapshot',campaignId}});
   onStatus(event);
  },
  onData:event=>{if(!stopped)replicator?.receive(event);},
 });
 replicator=createGameStateReplicator({campaignId,role,send:(payload,peerId)=>transport.send(payload,peerId),onSnapshot});
 return {
  publish(snapshot){return !stopped&&replicator.publish(snapshot);},
  requestSnapshot(){return !stopped&&replicator.requestSnapshot();},
  getSnapshot(){return stopped?null:replicator.getSnapshot();},
  close(){if(stopped)return;stopped=true;transport.close();replicator.close();},
 };
}
