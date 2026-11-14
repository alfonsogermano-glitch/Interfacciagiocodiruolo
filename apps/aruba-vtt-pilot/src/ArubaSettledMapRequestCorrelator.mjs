/**
 * Isolated GM-side correlation of independently verified requests with
 * original, SETTLED active-scene publications.
 *
 * A coalesced publication does NOT carry request IDs. It is unsafe to
 * attribute every pending command to a revision. The trusted GM caller
 * must supply a per-request predicate proving that the requested effect
 * exists in the settled state; ambiguous requests stay unconfirmed.
 * Register each request with canonical GM-owned effectKeys to block
 * attribution when multiple requests touched overlapping fields.
 *
 * This module does not invoke the original handlers or replace their
 * publication. It is opt-in, not mounted in SessionWorkspace.
 */
import {subscribeCommittedMapPublication,subscribeFailedMapPublication} from '../../../src/app/components/session/activeScenePublicationObserver.ts';

const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const safeRevision=n=>Number.isSafeInteger(n)&&n>=0;
// Lexical ordering is chronological only for canonical UTC ISO timestamps.
const canonicalTimestamp=value=>typeof value==='string'&&
 /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value)&&
 Number.isFinite(Date.parse(value))&&
 new Date(value).toISOString()===value;
const MAX_PENDING=128;
const isObject=x=>x!==null&&typeof x==='object'&&!Array.isArray(x);
const copy=x=>structuredClone(x);
// The trusted GM assigns canonical object+field keys. A key MUST identify
// the same logical field across different players and repeated commands.
const validEffectKeys=keys=>Array.isArray(keys)&&keys.length>0&&keys.length<=64&&
 keys.every(k=>typeof k==='string'&&k.length>0&&k.length<=256)&&
 new Set(keys).size===keys.length;

export function createArubaSettledMapRequestCorrelator({
 campaignId,gmUserId,source,tracker,getVerifiedPeer,isVerifiedMember,
 proveRequestedEffect,onResyncRequired=()=>{},onError=()=>{},
 subscribe=subscribeCommittedMapPublication,
 subscribeFailure=subscribeFailedMapPublication,
}={}){
 if(!UUID.test(campaignId)||!UUID.test(gmUserId)||
  typeof source?.publishObservedMap!=='function'||
  typeof tracker?.expect!=='function'||typeof tracker?.cancel!=='function'||
  typeof getVerifiedPeer!=='function'||typeof isVerifiedMember!=='function'||
  typeof proveRequestedEffect!=='function'||
  typeof onResyncRequired!=='function'||typeof onError!=='function'||
  typeof subscribe!=='function'||typeof subscribeFailure!=='function')
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
 function register({userId,peerId,requestId,chapterId,acceptedAfter,effectKeys}={}){
  if(closed||suspended||processing||!UUID.test(userId)||
   userId===gmUserId||!UUID.test(peerId)||!UUID.test(requestId)||
   typeof chapterId!=='string'||!chapterId||
   !canonicalTimestamp(acceptedAfter)||
   (latest!==null&&acceptedAfter<latest)||
   !validEffectKeys(effectKeys)||
   !member(userId)||pending.size>=MAX_PENDING||
   pending.has(key(userId,requestId)))return false;
  let peer;
  try{peer=getVerifiedPeer({campaignId,userId});}catch(e){error(e);return false;}
  if(!isObject(peer)||peer.peerId!==peerId||!safeRevision(peer.revision))
   return false;
  // The original hook generates strictly monotonic publishedAt; the request
  // must be tied to an authoritative baseline supplied by the GM.
  pending.set(key(userId,requestId),{
   userId,peerId,requestId,chapterId,acceptedAfter,effectKeys:[...effectKeys],
  });
  return true;
 }
 function settled({campaignId:scope,chapterId,publishedAt,state}={}){
  if(closed||suspended||processing||scope!==campaignId||
   typeof chapterId!=='string'||!canonicalTimestamp(publishedAt)||
   !isObject(state)||state.campaignId!==campaignId||
   state.chapterId!==chapterId||state.publishedAt!==publishedAt)return false;
  if(latest!==null&&publishedAt<=latest)return false;
  // Do not consume this map stream's revision for a different chapter
  // while current chapter requests await correlation. Scene transitions
  // require a dedicated authoritative resnapshot, not cross-chapter credit.
  if(pending.size>0&&![...pending.values()].some(entry=>entry.chapterId===chapterId))
   return false;
  processing=true;
  try{
   // All per-request effects must be checked on the SAME settled state.
   // Do not allow an arbitrary callback to mutate the observer's original.
   const matched=[];
   const eligible=[];
   for(const [id,entry] of pending){
    if(entry.chapterId!==chapterId)continue;
    if(!member(entry.userId)){pending.delete(id);continue;}
    if(publishedAt<=entry.acceptedAfter)continue;
    const peer=getVerifiedPeer({campaignId,userId:entry.userId});
    if(!peer||peer.peerId!==entry.peerId||!safeRevision(peer.revision)){
     pending.delete(id);continue;
    }
    eligible.push({id,entry});
    let proven=false;
    try{
     proven=proveRequestedEffect({
      campaignId,userId:entry.userId,requestId:entry.requestId,
      chapterId,publishedAt,state:copy(state),
     })===true;
    }catch(e){
     // A failed proof cannot be retried against a later unrelated batch:
     // doing so could falsely attribute that later state to this request.
     error(e);
     pending.delete(id);
     // Keep its field provenance for this batch: a throwing proof must
     // still contest another request touching the same canonical field.
     continue;
    }
    if(proven)matched.push({id,entry,priorRevision:peer.revision});
   }
   // When multiple eligible pending commands target the SAME field during one
   // debounce window, the final state cannot prove which command caused it.
   // This applies even when only ONE predicate matches the final state.
   // Reject attribution for ALL overlapping candidates, even if a generic
   // predicate would match both. Keep the requests pending but unconfirmed.
   const contested=new Set();
   const claimed=new Map();
   for(const item of eligible){
    for(const field of item.entry.effectKeys){
     const other=claimed.get(field);
     if(other){contested.add(other.id);contested.add(item.id);}
     else claimed.set(field,item);
    }
   }
   // Contested command results can never be proven retroactively by a
   // later unrelated publication. Discard their pending attribution.
   for(const id of contested)pending.delete(id);
   const unambiguous=matched.filter(item=>!contested.has(item.id));
   // Register receipts before source publication: synchronous WebRTC
   // callbacks may acknowledge during the publish itself.
   const registered=[];
   for(const item of unambiguous){
    if(!safeRevision(item.priorRevision+1)||
     !tracker.expect({
      userId:item.entry.userId,peerId:item.entry.peerId,
      requestId:item.entry.requestId,revision:item.priorRevision+1,
     })){
     // A proved request whose receipt cannot be registered must never be
     // credited to a later unrelated settled publication.
     pending.delete(item.id);
     continue;
    }
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
 const unsubscribeFailure=subscribeFailure(campaignId,()=>{
  if(!closed)suspend('Original queued map save or broadcast failed');
 });
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
   unsubscribeFailure();
   for(const entry of pending.values())revokeEntry(entry);
   pending.clear();
  },
 });
}
