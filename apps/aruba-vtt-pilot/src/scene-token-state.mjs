/** Pure scene/token state operations for the GM-owned WebRTC snapshot stream.
 * No legacy persistence, browser globals or player-authored state mutations. */
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const finite=n=>typeof n==='number'&&Number.isFinite(n)&&Math.abs(n)<=100000;
const text=(v,max)=>typeof v==='string'&&v.length>0&&v.length<=max;
function validateToken(t){
 if(!t||typeof t!=='object'||Array.isArray(t)||!UUID.test(t.id??'')||
  !text(t.name,120)||!finite(t.x)||!finite(t.y)||
  !Number.isInteger(t.size)||t.size<1||t.size>20||typeof t.visible!=='boolean')
  throw new TypeError('Invalid scene token');
 return {id:t.id,name:t.name,x:t.x,y:t.y,size:t.size,visible:t.visible};
}
export function createEmptyScene(sceneId){
 if(!UUID.test(sceneId))throw new TypeError('Invalid scene ID');
 return {sceneId,tokens:[]};
}
export function applySceneTokenAction(state,action){
 if(!state||!UUID.test(state.sceneId??'')||!Array.isArray(state.tokens)||state.tokens.length>500||
  !action||typeof action!=='object'||Array.isArray(action))throw new TypeError('Invalid scene action');
 const tokens=state.tokens.map(validateToken);
 if(new Set(tokens.map(t=>t.id)).size!==tokens.length)throw new TypeError('Duplicate token');
 if(action.type==='add'){
  const token=validateToken(action.token);
  if(tokens.length>=500||tokens.some(t=>t.id===token.id))throw new TypeError('Token already exists or scene full');
  return {sceneId:state.sceneId,tokens:[...tokens,token]};
 }
 if(action.type==='move'){
  if(!UUID.test(action.tokenId??'')||!finite(action.x)||!finite(action.y)||
   !tokens.some(t=>t.id===action.tokenId))throw new TypeError('Invalid token movement');
  return {sceneId:state.sceneId,tokens:tokens.map(t=>t.id===action.tokenId?{...t,x:action.x,y:action.y}:t)};
 }
 if(action.type==='visibility'){
  if(!UUID.test(action.tokenId??'')||typeof action.visible!=='boolean'||
   !tokens.some(t=>t.id===action.tokenId))throw new TypeError('Invalid token visibility');
  return {sceneId:state.sceneId,tokens:tokens.map(t=>t.id===action.tokenId?{...t,visible:action.visible}:t)};
 }
 if(action.type==='remove'){
  if(!UUID.test(action.tokenId??'')||!tokens.some(t=>t.id===action.tokenId))throw new TypeError('Token not found');
  return {sceneId:state.sceneId,tokens:tokens.filter(t=>t.id!==action.tokenId)};
 }
 throw new TypeError('Unknown token action');
}
/** Connect pure GM actions to an existing authoritative live session. */
export function createGmSceneController({liveSession,sceneId}){
 if(!liveSession||typeof liveSession.publish!=='function'||typeof liveSession.getSnapshot!=='function')
  throw new TypeError('Invalid GM live session');
 let state=createEmptyScene(sceneId);
 return {
  dispatch(action){const next=applySceneTokenAction(state,action);if(liveSession.publish(next)!==true)return false;state=next;return true;},
  getState(){return structuredClone(state);},
  publishInitial(){return liveSession.publish(state)===true;},
 };
}
