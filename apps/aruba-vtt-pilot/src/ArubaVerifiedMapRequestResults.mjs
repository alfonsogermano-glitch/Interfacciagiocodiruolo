/**
 * Experimental opt-in request-result envelope for GM map commands.
 *
 * "dispatched" means the synchronous original GM handler accepted the
 * command without reporting rejection. It does NOT mean durable storage,
 * revisioned publication, or a visual render was confirmed.
 *
 * The caller MUST provide authenticated user identity from signaling and
 * an authenticated, user-scoped result callback. No wire identity is trusted.
 * requestId is passed separately as an opaque correlation token, never
 * inside the original map handler payload.
 * This is NOT mounted on the legacy SessionWorkspace or public VTT.
 */
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
// Keep a bounded, connection-lifetime replay ledger. Never evict an ID while
// its channel is alive: eviction would allow an old command to execute twice.
const MAX_RECENT=4096;
const MAX_PAYLOAD_BYTES=60000;
const utf8=new TextEncoder();
function bounded(value){
 try{
  const wire=JSON.stringify(value);
  return typeof wire==='string'&&utf8.encode(wire).length<=MAX_PAYLOAD_BYTES
   ?JSON.parse(wire):null;
 }catch{return null;}
}
const isObject=x=>x!==null&&typeof x==='object'&&!Array.isArray(x);

export function createArubaVerifiedMapRequestResults({
 campaignId,gmUserId,dispatch,isVerifiedMember,sendVerifiedResult,
 onError=()=>{},
}){
 if(!UUID.test(campaignId)||!UUID.test(gmUserId)||
  typeof dispatch?.receiveFromPlayer!=='function'||
  typeof isVerifiedMember!=='function'||typeof sendVerifiedResult!=='function'||
  typeof onError!=='function')
  throw new TypeError('Verified GM dispatcher, membership and result transport required');
 let closed=false,handling=false;
 const recent=new Map();
 const safeError=error=>{try{onError(error);}catch{}};
 const allowed=userId=>!closed&&UUID.test(userId)&&userId!==gmUserId&&
  isVerifiedMember({campaignId,userId})===true;
 function receiveFromPlayer({campaignId:scope,fromUserId,event,payload}={}){
  if(closed||handling||scope!==campaignId||!isObject(payload)||
   !UUID.test(fromUserId))return false;
  let identityAllowed=false;
  try{identityAllowed=allowed(fromUserId);}catch(error){safeError(error);}
  if(!identityAllowed)return false;
  const requestId=payload.requestId;
  // Requests without a valid id are refused without feedback. There must
  // never be a success acknowledgment for an uncorrelatable request.
  if(!UUID.test(requestId)||requestId===gmUserId)return false;
  const copy=bounded(payload);
  if(!isObject(copy))return false;
  const action={...copy};
  delete action.requestId;
  // Reject nested requestId in data is handled by the existing GM policy.
  const key=fromUserId+'\u0000'+requestId;
  const fingerprint=JSON.stringify({event,payload:action});
  const stored=recent.get(key);
  let result;
  if(stored){
   if(stored.fingerprint!==fingerprint)return false;
   result=stored.result;
  }else{
   // Once the ledger is full, fail closed until the connection owner rotates
   // this instance. Silently evicting old IDs would re-enable replay.
   if(recent.size>=MAX_RECENT)return false;
   handling=true;
   let accepted=false;
   try{
    // The GM dispatcher revalidates CURRENT chapter and permissions at
    // execution time and sends only normalized commands to original slots.
    accepted=dispatch.receiveFromPlayer({
     campaignId,fromUserId,event,payload:action,requestId,
    })===true;
   }catch(error){safeError(error);}
   finally{handling=false;}
   result=Object.freeze({
    type:'map-command-result',requestId,
    outcome:accepted?'dispatched':'rejected',
   });
   recent.set(key,{fingerprint,result});
  }
  // Revocation or member change during GM callback cancels the response.
  try{
   if(!allowed(fromUserId))return false;
   // Transmit only using server-verified authenticated destination.
   sendVerifiedResult({campaignId,toUserId:fromUserId,result:{...result}});
  }catch(error){safeError(error);return false;}
  return result.outcome==='dispatched';
 }
 return Object.freeze({
  receiveFromPlayer,
  close(){closed=true;recent.clear();},
  get recentRequests(){return recent.size;},
  get closed(){return closed;},
 });
}
