import {createGmSceneController} from './scene-token-state.mjs';
import {createPlayerSceneView} from './player-scene-view.mjs';
/** Role-aware scene coordinator; no parallel scene state is exposed to players. */
export function createLiveSceneCoordinator({role,sceneId,liveSession,onScene=()=>{}}){
 if(!['host','player'].includes(role)||!liveSession||typeof onScene!=='function')
  throw new TypeError('Invalid live scene coordinator');
 if(role==='host'){
  const gm=createGmSceneController({liveSession,sceneId});
  return {
   dispatch(action){const result=gm.dispatch(action);if(result)onScene(gm.getState());return result;},
   publishInitial(){return gm.publishInitial();},
   getScene(){return gm.getState();},
   receiveSnapshot(){return false;},
   reset(){},
  };
 }
 const view=createPlayerSceneView();
 return {
  dispatch(){return false;},
  publishInitial(){return false;},
  getScene(){return view.getScene()?.scene??null;},
  receiveSnapshot(snapshot){
   if(!view.apply(snapshot))return false;
   onScene(view.getScene().scene);return true;
  },
  reset(){view.reset();onScene(null);},
 };
}
