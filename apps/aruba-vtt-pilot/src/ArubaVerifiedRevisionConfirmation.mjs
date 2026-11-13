/**
 * Opt-in correlator between GM-command request IDs and player-reported
 * applied visible revisions. NOT a persistence or render acknowledgment.
 *
 * Expected revisions MUST be registered by a trusted GM after a successful
 * authoritative source commit and a player-scoped revision allocation.
 * An acknowledgment is accepted only from the authenticated, same-generation
 * channel for that precise player and peer. A trusted source-revision reader
 * rejects acknowledgments ahead of the GM's actual allocated revision. Clients can still lie about
 * their own application: no claim of durable or graphical completion.
 */
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_PENDING=128;
const validRevision=x=>Number.isSafeInteger(x)&&x>=0;
export function createArubaVerifiedRevisionConfirmation({
 campaignId,gmUserId,isVerifiedMember,getPublishedRevision,sendVerifiedResult,onError=()=>{},
}){
 if(!UUID.test(campaignId)||!UUID.test(gmUserId)||
  typeof isVerifiedMember!=='function'||typeof getPublishedRevision!=='function'||
  typeof sendVerifiedResult!=='function'||typeof onError!=='function')
  throw new TypeError('Trusted GM membership and result sender required');
 const pending=new Map();
 let closed=false;
 const fail=e=>{try{onError(e);}catch{};return false;};
 const member=userId=>{
  try{return !closed&&isVerifiedMember({campaignId,userId})===true;}
  catch(e){fail(e);return false;}
 };
 const key=(userId,requestId)=>userId+'\u0000'+requestId;
 function expect({userId,peerId,requestId,revision}={}){
  if(closed||!UUID.test(userId)||userId===gmUserId||
   !UUID.test(peerId)||!UUID.test(requestId)||!validRevision(revision)||
   !member(userId)||pending.size>=MAX_PENDING||
   pending.has(key(userId,requestId)))return false;
  pending.set(key(userId,requestId),{userId,peerId,requestId,revision});
  return true;
 }
 function acknowledge({authenticatedUserId,verifiedCampaignId,peerId,revision}={}){
  if(closed||verifiedCampaignId!==campaignId||
   !UUID.test(authenticatedUserId)||!UUID.test(peerId)||
   !validRevision(revision)||!member(authenticatedUserId))return false;
  let observed=false;
  let published;
  try{published=getPublishedRevision({campaignId,userId:authenticatedUserId,peerId});}
  catch(e){return fail(e);}
  if(!validRevision(published)||revision>published)return false;
  // One acknowledged cumulative revision can cover several commands from
  // the same verified channel, provided every expected revision is <= it.
  for(const [id,entry] of [...pending]){
   if(entry.userId!==authenticatedUserId||entry.peerId!==peerId||
    entry.revision>revision)continue;
   if(!member(authenticatedUserId))return false;
   // Remove before invoking callbacks to avoid reentrant duplicate results.
   pending.delete(id);
   try{
    const result={type:'map-command-result',requestId:entry.requestId,
     outcome:'received-revision',revision:entry.revision};
    sendVerifiedResult({campaignId,toUserId:entry.userId,result});
    observed=true;
   }catch(error){fail(error);}
  }
  return observed;
 }
 function revoke({userId,peerId}={}){
  if(closed)return;
  for(const [id,entry] of pending){
   if(entry.userId===userId&&(peerId===undefined||entry.peerId===peerId))
    pending.delete(id);
  }
 }
 return Object.freeze({
  expect,acknowledge,revoke,
  close(){closed=true;pending.clear();},
  get pendingCount(){return pending.size;},
 });
}
