/** Scene-scoped player projection: hidden GM tokens must never be sent to players. */
export function projectSceneForPlayer(scene){
 if(!scene||typeof scene!=='object'||Array.isArray(scene)||
  typeof scene.sceneId!=='string'||!Array.isArray(scene.tokens))
  throw new TypeError('Invalid scene');
 return {sceneId:scene.sceneId,tokens:scene.tokens.filter(token=>token?.visible===true)
  .map(({id,name,x,y,size})=>({id,name,x,y,size,visible:true}))};
}
/** Publish a player-safe projection while preserving the complete GM state locally. */
export function createPlayerScenePublisher({liveSession,sceneId,applySceneTokenAction,createEmptyScene}){
 if(!liveSession||typeof liveSession.publish!=='function'||
  typeof applySceneTokenAction!=='function'||typeof createEmptyScene!=='function')
  throw new TypeError('Invalid scene publisher');
 let state=createEmptyScene(sceneId);
 return {
  dispatch(action){
   const next=applySceneTokenAction(state,action);
   if(liveSession.publish(projectSceneForPlayer(next))!==true)return false;
   state=next;return true;
  },
  publishInitial(){return liveSession.publish(projectSceneForPlayer(state))===true;},
  getGmState(){return structuredClone(state);},
 };
}
