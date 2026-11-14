/**
 * Source-aligned map projection for experimental Aruba GM revision streams.
 * Imports ORIGINAL Hollowgate visibility and layer-order helpers.
 * No new map visibility semantics and no feature flag activation.
 *
 * Only map-scoped fields are accepted here: caller separately authorizes
 * campaign GM and every connected player. The canonical map state remains
 * owned by the original SessionWorkspace, not this adapter.
 */
import {
 publicMapTokens,publicMapDrawings,publicMapPois,
} from '../../../src/app/components/session/sessionMapVisibility.ts';
import {
 reconcileMapObjectOrder,filterMapObjectOrder,
} from '../../../src/app/components/session/mapObjectLayers.ts';

const isObject=x=>!!x&&typeof x==='object'&&!Array.isArray(x);
const copy=x=>JSON.parse(JSON.stringify(x));
function validateMap(state){
 if(!isObject(state)||!Array.isArray(state.mapTokens)||
  !Array.isArray(state.mapDrawings)||!Array.isArray(state.mapPois)||
  (state.mapObjectOrder!==undefined&&!Array.isArray(state.mapObjectOrder))||
  (state.mapFog!==undefined&&!Array.isArray(state.mapFog)))
  throw new TypeError('Original GM map arrays required');
 for(const family of ['mapTokens','mapDrawings','mapPois','mapFog']){
  for(const entry of state[family]??[]){
   if(!isObject(entry)||typeof entry.id!=='string'||!entry.id)
    throw new TypeError('Invalid original map object');
  }
 }
 return copy(state);
}
/** Only the original map's player-visible object families and order. */
export function projectOriginalMapForPlayer(state){
 const current=validateMap(state);
 const tokens=publicMapTokens(current.mapTokens);
 const drawings=publicMapDrawings(current.mapDrawings);
 const pois=publicMapPois(current.mapPois);
 const order=reconcileMapObjectOrder(current.mapObjectOrder,[
  ['drawing',current.mapDrawings],['token',current.mapTokens],['poi',current.mapPois],
 ]);
 const visible=[
  ...drawings.map(({id})=>({family:'drawing',id})),
  ...tokens.map(({id})=>({family:'token',id})),
  ...pois.map(({id})=>({family:'poi',id})),
 ];
 return {
  mapTokens:tokens,mapDrawings:drawings,mapPois:pois,
  mapObjectOrder:filterMapObjectOrder(order,visible),
  // Original SessionWorkspace publishes the full mapFog document (including
  // exploration, persistence and vision blockers) without a per-fog visibility
  // filter. Do not invent extra filtering or drop its geometry on Aruba.
  mapFog:current.mapFog??[],
 };
}
/**
 * The producer invokes this AFTER a GM-authorized commit, with independent
 * clones of previous and next canonical state. Only real player-visible
 * changes generate an active_scene_map_patch revision. This prevents GM
 * secret-only edits consuming observable revision numbers.
 */
export function projectOriginalMapDelta({event,previousState,state}){
 if(event!=='active_scene_map_patch')return null;
 const before=projectOriginalMapForPlayer(previousState);
 const after=projectOriginalMapForPlayer(state);
 if(JSON.stringify(before)===JSON.stringify(after))return null;
 return {event:'active_scene_map_patch',payload:after};
}
