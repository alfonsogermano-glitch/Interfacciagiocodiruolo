import {createCampaignLiveSession} from './campaign-live-session.mjs';
import {createLiveSceneCoordinator} from './live-scene-coordinator.mjs';
/** Compose authenticated transport and role-limited scene state for the VTT renderer.
 * The caller must first pass the authorized campaign membership gate. */
export function createCampaignSceneSession({origin,campaignId,sceneId,role,WebSocketImpl,PeerConnectionImpl,iceServers,onStatus,onScene=()=>{}}){
 if(!['host','player'].includes(role)||typeof onScene!=='function')
  throw new TypeError('Invalid scene session');
 let coordinator;
 const live=createCampaignLiveSession({origin,campaignId,role,WebSocketImpl,PeerConnectionImpl,iceServers,onStatus,
  onSnapshot:snapshot=>{if(role==='player')coordinator?.receiveSnapshot(snapshot);},
 });
 coordinator=createLiveSceneCoordinator({role,sceneId,liveSession:live,onScene});
 let closed=false;
 return {
  dispatch(action){return !closed&&coordinator.dispatch(action);},
  publishInitial(){return !closed&&coordinator.publishInitial();},
  getScene(){return closed?null:coordinator.getScene();},
  requestSnapshot(){return !closed&&live.requestSnapshot();},
  close(){if(closed)return;closed=true;live.close();coordinator.reset();},
 };
}
