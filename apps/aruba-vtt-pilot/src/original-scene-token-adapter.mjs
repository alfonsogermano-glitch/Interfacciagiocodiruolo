import {createEmptyScene,applySceneTokenAction} from './scene-token-state.mjs';
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
/** Read-only boundary from the ORIGINAL ActiveScenePublication to the minimal
 * GM-hosted token transport. Never mutate the original publication or silently
 * substitute the campaign ID for a missing scene ID. */
export function projectOriginalSceneTokens(publication,campaignId){
 if(!publication||!UUID.test(campaignId??'')||publication.campaignId!==campaignId||!UUID.test(publication.sceneId??'')||
  !Array.isArray(publication.mapTokens)||publication.mapTokens.length>500)throw new TypeError('Original active scene unavailable');
 let state=createEmptyScene(publication.sceneId);
 for(const source of publication.mapTokens){
  if(!source||!UUID.test(source.id??'')||typeof source.name!=='string'||
   (source.visible!==undefined&&typeof source.visible!=='boolean')||
   (source.hiddenFromPlayers!==undefined&&typeof source.hiddenFromPlayers!=='boolean')||
   (source.size!==undefined&&(!Number.isInteger(source.size)||source.size<1||source.size>20)))
   throw new TypeError('Invalid original map token');
  state=applySceneTokenAction(state,{type:'add',token:{
   id:source.id,name:source.name,x:source.x,y:source.y,
   size:source.size??1,
   // Match original sessionMapVisibility.publicMapTokens: catalog-level
   // hiddenFromPlayers does not hide an already placed map token.
   visible:source.visible!==false,
  }});
 }
 return state;
}
