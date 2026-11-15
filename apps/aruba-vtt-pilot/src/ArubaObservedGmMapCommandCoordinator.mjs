/**
 * Opt-in coordinator: authorized player command -> ORIGINAL GM handler ->
 * observed canonical GM map -> revisioned player projection -> receipt.
 * This does NOT mount any React UI or run on production.
 *
 * The original SessionWorkspace must own map mutation. We only read its
 * updated state and pass that trusted snapshot into the GM revision source.
 * Source revisions are per peer. A command is never marked "received" just
 * because its handler ran or because it changed only private GM state.
 */
import {createArubaVerifiedMapRequestResults} from './ArubaVerifiedMapRequestResults.mjs';

const plain=x=>x!==null&&typeof x==='object'&&!Array.isArray(x);
const number=x=>Number.isSafeInteger(x)&&x>=0;
export function createArubaObservedGmMapCommandCoordinator({
 campaignId,gmUserId,dispatcher,source,tracker,getCurrentMapContext,
 getVerifiedPlayerPeer,isVerifiedMember,sendVerifiedResult,
 onResyncRequired=()=>{},onError=()=>{},
}){
 if(typeof dispatcher?.receiveFromPlayer!=='function'||
  typeof dispatcher?.authorizePlayerEvent!=='function'||
  typeof source?.publishObservedMap!=='function'||
  typeof tracker?.expect!=='function'||typeof tracker?.cancel!=='function'||
  typeof getCurrentMapContext!=='function'||
  typeof getVerifiedPlayerPeer!=='function'||
  typeof isVerifiedMember!=='function'||
  typeof sendVerifiedResult!=='function'||typeof onResyncRequired!=='function'||
  typeof onError!=='function')
  throw new TypeError('Original GM dispatcher, revision source and verified peer required');
 let closed=false,suspended=false;
 const error=e=>{try{onError(e);}catch{}};
 const suspend=reason=>{
  if(suspended)return;
  suspended=true;
  try{onResyncRequired({campaignId,reason});}catch(e){error(e);}
 };
 const bridge={
  receiveFromPlayer({campaignId:scope,fromUserId,event,payload,requestId}={}){
   if(closed||suspended||scope!==campaignId)return false;
   // Read the verified live peer and its revision immediately before the
   // command. It is not taken from any player-provided wire envelope.
   let peer,context;
   try{
    if(isVerifiedMember({campaignId,userId:fromUserId})!==true)return false;
    peer=getVerifiedPlayerPeer({campaignId,userId:fromUserId});
    context=getCurrentMapContext({campaignId});
   }catch(e){error(e);return false;}
   if(!plain(peer)||!number(peer.revision)||typeof peer.peerId!=='string'||
    !plain(context)||!plain(context.state)||
    typeof context.chapterId!=='string'||context.chapterId!==payload?.chapterId)
    return false;
   // The GM dispatcher independently revalidates against the same current
   // chapter and object permissions and executes the ORIGINAL handler.
   if(dispatcher.receiveFromPlayer({campaignId,fromUserId,event,payload})!==true)
    return false;
   let updated;
   try{
    updated=getCurrentMapContext({campaignId});
    if(closed||!plain(updated)||updated.chapterId!==context.chapterId||
     !plain(updated.state)||
     isVerifiedMember({campaignId,userId:fromUserId})!==true)return false;
    const currentPeer=getVerifiedPlayerPeer({campaignId,userId:fromUserId});
    if(!currentPeer||currentPeer.peerId!==peer.peerId||
     currentPeer.revision!==peer.revision||!number(peer.revision+1))
     return false;
    // Register expected revision BEFORE publishObservedMap, since WebRTC
    // callbacks may acknowledge synchronously during source publication.
    const target=peer.revision+1;
    if(!tracker.expect({userId:fromUserId,peerId:peer.peerId,requestId,revision:target}))
     return false;
    const published=source.publishObservedMap({
     authenticatedGmUserId:gmUserId,nextState:updated.state,
    })===true;
    const finalPeer=getVerifiedPlayerPeer({campaignId,userId:fromUserId});
    if(!published||!finalPeer||finalPeer.peerId!==peer.peerId||
     (finalPeer.revision!==target&&finalPeer.revision!==peer.revision)){
     tracker.cancel({userId:fromUserId,peerId:peer.peerId,requestId});
     suspend('Observed GM map could not be published consistently');
     return false;
    }
    if(finalPeer.revision!==target){
     // A private-only/no-op edit changes no player revision.
     tracker.cancel({userId:fromUserId,peerId:peer.peerId,requestId});
     return true;
    }
    return true;
   }catch(e){
    tracker.cancel({userId:fromUserId,peerId:peer.peerId,requestId});
    error(e);
    suspend('Observed GM map publish raised an error');
    return false;
   }
  },
 };
 const results=createArubaVerifiedMapRequestResults({
  campaignId,gmUserId,dispatch:bridge,isVerifiedMember,
  sendVerifiedResult,onError,
 });
 return Object.freeze({
  authorizePlayerEvent:args=>!closed&&!suspended&&dispatcher.authorizePlayerEvent(args),
  receiveFromPlayer:args=>!closed&&!suspended&&results.receiveFromPlayer(args),
  recoverAfterVerifiedResnapshot({authenticatedGmUserId,nextState}={}){
   if(closed||!suspended||authenticatedGmUserId!==gmUserId||
    typeof source.resetFromObservedMap!=='function')return false;
   let ok=false;
   try{ok=source.resetFromObservedMap({authenticatedGmUserId,nextState})===true;}
   catch(e){error(e);}
   if(ok)suspended=false;
   return ok;
  },
  get suspended(){return suspended;},
  close(){closed=true;results.close();},
 });
}
