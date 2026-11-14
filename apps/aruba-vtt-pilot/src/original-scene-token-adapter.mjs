import {createEmptyScene,applySceneTokenAction} from './scene-token-state.mjs';
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
/** Read-only boundary from the ORIGINAL ActiveScenePublication to the minimal
 * GM-hosted token transport. Never mutate the original publication or silently
 * substitute the campaign ID for a missing scene ID. */
export function projectOriginalSceneTokens(publication,campaignId){
 if(!publication||publication.campaignId!==campaignId||!UUID.test(publication.sceneId??'')||
  !Array.isArray(publication.mapTokens))throw new TypeError('Original active scene unavailable');
 let state=createEmptyScene(publication.sceneId);
 for(const source of publication.mapTokens){
  if(!source||!UUID.test(source.id??'')||typeof source.name!=='string'||
   (source.visible!==undefined&&typeof source.visible!=='boolean')||
   (source.hiddenFromPlayers!==undefined&&typeof source.hiddenFromPlayers!=='boolean'))
   throw new TypeError('Invalid original map token');
  state=applySceneTokenAction(state,{type:'add',token:{
   id:source.id,name:source.name,x:source.x,y:source.y,
   size:source.size??1,
   visible:source.visible!==false&&source.hiddenFromPlayers!==true,
  }});
 }
 return state;
}
