/**
 * Experimental GM-side bridge to ORIGINAL SessionWorkspace action handlers.
 *
 * The router supplies authenticated fromUserId, never a player-claimed actor.
 * A lightweight router preflight is insufficient: dispatch always reads the
 * CURRENT GM map state and re-authorizes synchronously immediately before
 * executing the original handler callback.
 *
 * No reducer or renderer is reimplemented here; callers inject the ORIGINAL
 * playerMapActionHandlerRef / playerMapPoiActionHandlerRef /
 * playerMapLayerActionHandlerRef equivalents on the GM browser.
 *
 * This module is opt-in; NOT connected to the original VTT or VPS.
 */
import {authorizeVerifiedPlayerMapRequest} from './ArubaVerifiedPlayerMapAuthorization.mjs';

const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const HANDLER_BY_EVENT=Object.freeze({
 map_token_action:'onTokenAction',
 map_poi_action:'onPoiAction',
 map_object_layer_action:'onLayerAction',
});
const isObject=x=>!!x&&typeof x==='object'&&!Array.isArray(x);
const isPromise=x=>x!==null&&typeof x==='object'&&typeof x.then==='function';

export function createArubaVerifiedGmMapDispatch({
 campaignId,gmUserId,getCurrentMapContext,isVerifiedMember,
 onTokenAction,onPoiAction,onLayerAction,onError=()=>{},
}){
 if(!UUID.test(campaignId)||!UUID.test(gmUserId)||
  typeof getCurrentMapContext!=='function'||
  typeof isVerifiedMember!=='function'||
  typeof onTokenAction!=='function'||
  typeof onPoiAction!=='function'||
  typeof onLayerAction!=='function'||
  typeof onError!=='function')
  throw new TypeError('Trusted GM map state, membership and original handlers required');
 const handlers={onTokenAction,onPoiAction,onLayerAction};
 let closed=false,dispatching=false;
 const fail=error=>{try{onError(error);}catch{};return null;};
 function prepare({userId,event,payload,requestedCampaignId}){
  if(closed||!UUID.test(userId)||userId===gmUserId||
   requestedCampaignId!==campaignId||!Object.hasOwn(HANDLER_BY_EVENT,event)||
   !isObject(payload))return null;
  try{
   // The authoritative member proof is local to the GM's authenticated
   // connection registry and MUST be re-evaluated on each attempt.
   if(isVerifiedMember({campaignId,userId})!==true)return null;
   const current=getCurrentMapContext({campaignId});
   if(isPromise(current)||!isObject(current)||
    typeof current.chapterId!=='string'||!current.chapterId||
    !isObject(current.state))return null;
   const command=authorizeVerifiedPlayerMapRequest({
    authenticatedUserId:userId,gmUserId,
    campaignId,verifiedCampaignId:campaignId,
    chapterId:current.chapterId,state:current.state,event,payload,
   });
   if(!command||closed)return null;
   // A trusted callback can revoke a peer or change active membership;
   // re-check immediately before a handler can receive the command.
   if(isVerifiedMember({campaignId,userId})!==true||closed)return null;
   return command;
  }catch(error){return fail(error);}
 }
 function authorizePlayerEvent({campaignId:requestedCampaignId,userId,event,payload}={}){
  if(dispatching)return false;
  return prepare({requestedCampaignId,userId,event,payload})!==null;
 }
 function receiveFromPlayer({campaignId:requestedCampaignId,fromUserId,event,payload}={}){
  // Reentrant GM callbacks can otherwise cause nested commands based on
  // state which is only halfway through the original handler's mutation.
  if(closed||dispatching)return false;
  const command=prepare({requestedCampaignId,userId:fromUserId,event,payload});
  if(!command)return false;
  const handler=handlers[HANDLER_BY_EVENT[event]];
  dispatching=true;
  try{
   // The original handler accepts only a normalized payload and updates
   // SessionWorkspace itself (including history and map publications).
   const {event:ignored,...normalized}=command;
   const result=handler(normalized);
   if(isPromise(result))throw new Error('Original GM handler must be synchronous');
   return result!==false;
  }catch(error){fail(error);return false;}
  finally{dispatching=false;}
 }
 return Object.freeze({
  authorizePlayerEvent,receiveFromPlayer,
  close(){closed=true;},
  get closed(){return closed;},
 });
}
