/**
 * Isolated GM-side correlation of independently verified requests with
 * original, SETTLED active-scene publications.
 *
 * A coalesced publication does NOT carry request IDs. It is unsafe to
 * attribute every pending command to a revision. The trusted GM caller
 * must supply a per-request predicate proving that the requested effect
 * exists in the settled state; ambiguous requests stay unconfirmed.
 *
 * This module does not invoke the original handlers or replace their
 * publication. It is opt-in, not mounted in SessionWorkspace.
 */
import {subscribeCommittedMapPublication} from '../../../src/app/components/session/activeScenePublicationObserver.ts';

const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const safeRevision=n=>Number.isSafeInteger(n)&&n>=0;
const MAX_PENDING=128;
const isObject=x=>x!==null&&typeof x==='object'&&!Array.isArray(x);
const copy=x=>structuredClone(x);

export function createArubaSettledMapRequestCorrelator({
 campaignId,gmUserId,source,tracker,getVerifiedPeer,isVerifiedMember,
 proveRequestedEffect,onResyncRequired=()=>{},onError=()=>{},
 subscribe=subscribeCommittedMapPublication,
}={}){
 if(!UUID.test(campaignId)||!UUID.test(gmUserId)||
  typeof source?.publishObservedMap!=='function'||
  typeof tracker?.expect!=='function'||typeof tracker?.cancel!=='function'||
  typeof getVerifiedPeer!=='function'||typeof isVerifiedMember!=='function'||
  typeof proveRequestedEffect!=='function'||
  typeof onResyncRequired!=='function'||typeof onError!=='function'||
  typeof subscribe!=='function')
  throw new TypeError('Trusted original publication, player proof and GM source required');
 const pending=new Map();
 let closed=false,suspended=false,processing=false,latest=null;
 const key=(userId,requestId)=>userId+'\u0000'+requestId;
 const error=e=>{try{onError(e);}catch{}};
 const revokeEntry=(entry)=>{
  try{tracker.cancel({userId:entry.userId,peerId:entry.peerId,
   requestId:entry.requestId});}catch(e){error(e);}
 };
 const suspend=(reason)=>{
  if(suspended)return;
  suspended=true;
  for(const item of pending.values())revokeEntry(item);
  pending.clear();
  try{onResyncRequired({campaignId,reason});}catch(e){error(e);}
 };
 const member=userId=>{
  try{return isVerifiedMember({campaignId,userId})===true;}
  catch(e){error(e);return false;}
 };
 function register({userId,peerId,requestId,chapterId,acceptedAfter}={}){
  if(closed||suspended||processing||!UUID.test(userId)||
   userId===gmUserId||!UUID.test(peerId)||!UUID.test(requestId)||
   typeof chapterId!=='string'||!chapterId||
   typeof acceptedAfter!=='string'||!acceptedAfter||
   !member(userId)||pending.size>=MAX_PENDING||
   pending.has(key(userId,requestId)))return false;
  let peer;
  try{peer=getVerifiedPeer({campaignId,userId});}catch(e){error(e);return false;}
  if(!isObject(peer)||peer.peerId!==peerId||!safeRevision(peer.revision))
   return false;
  // The original hook generates strictly monotonic publishedAt; the request
  // must be tied to an authoritative baseline supplied by the GM.
  pending.set(key(userId,requestId),{
   userId,peerId,requestId,chapterId,acceptedAfter,
  });
  return true;
 }
 function settled({campaignId:scope,chapterId,publishedAt,state}={}){
  if(closed||suspended||processing||scope!==campaignId||
   typeof chapterId!=='string'||typeof publishedAt!=='string'||
   !isObject(state)||state.campaignId!==campaignId||
   state.chapterId!==chapterId||state.publishedAt!==publishedAt)return false;
  if(latest!==null&&publishedAt<=latest)return false;
  processing=true;
  try{
   // All per-request effects must be checked on the SAME settled state.
   // Do not allow an arbitrary callback to mutate the observer's original.
   const matched=[];
   for(const [id,entry] of pending){
    if(entry.chapterId!==chapterId)continue;
    if(!member(entry.userId)){pending.delete(id);continue;}
    if(publishedAt<=entry.acceptedAfter)continue;
    const peer=getVerifiedPeer({campaignId,userId:entry.userId});
    if(!peer||peer.peerId!==entry.peerId||!safeRevision(peer.revision)){
     pending.delete(id);continue;
    }
    let proven=false;
    try{
     proven=proveRequestedEffect({
      campaignId,userId:entry.userId,requestId:entry.requestId,
      chapterId,publishedAt,state:copy(state),
     })===true;
    }catch(e){error(e);}
    if(proven)matched.push({id,entry,priorRevision:peer.revision});
   }
   // Register receipts before source publication: synchronous WebRTC
   // callbacks may acknowledge during the publish itself.
   const registered=[];
   for(const item of matched){
    if(!safeRevision(item.priorRevision+1)||
     !tracker.expect({
      userId:item.entry.userId,peerId:item.entry.peerId,
      requestId:item.entry.requestId,revision:item.priorRevision+1,
     }))continue;
    registered.push(item);
   }
   const ok=source.publishObservedMap({
    authenticatedGmUserId:gmUserId,nextState:copy(state),
   })===true;
   if(!ok){
    for(const item of registered)revokeEntry(item.entry);
    suspend('Original settled map could not be published on the revision source');
    return false;
   }
   latest=publishedAt;
   for(const item of registered){
    const current=getVerifiedPeer({campaignId,userId:item.entry.userId});
    if(!current||current.peerId!==item.entry.peerId||
     !safeRevision(current.revision)||
     (current.revision!==item.priorRevision&&
      current.revision!==item.priorRevision+1)){
     suspend('Verified peer revision changed during settled publication');
     return false;
    }
    if(current.revision===item.priorRevision){
     // The proved effect was already visible, or no visible map delta was
     // produced. No new revision => NO delivery confirmation.
     revokeEntry(item.entry);
    }
    pending.delete(item.id);
   }
   return true;
  }catch(e){
   error(e);suspend('Settled map correlation failed');return false;
  }finally{processing=false;}
 }
 const unsubscribe=subscribe(campaignId,settled);
 function revoke({userId,peerId}={}){
  if(closed)return;
  for(const [id,entry] of pending){
   if(entry.userId!==userId||(peerId!==undefined&&entry.peerId!==peerId))continue;
   pending.delete(id);revokeEntry(entry);
  }
 }
 return Object.freeze({
  register,settled,revoke,
  get pendingCount(){return pending.size;},
  get suspended(){return suspended;},
  close(){
   if(closed)return;
   closed=true;
   unsubscribe();
   for(const entry of pending.values())revokeEntry(entry);
   pending.clear();
  },
 });
}
