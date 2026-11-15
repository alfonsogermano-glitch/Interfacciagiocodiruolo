/**
 * Opt-in application-receipt control message on an ALREADY VERIFIED RTC
 * DataChannel. Revision frames and receipt frames have distinct top-level
 * types and must be consumed by their respective endpoint only.
 *
 * Identity/campaign/peer are NEVER accepted from the wire. GM caller MUST
 * bind this adapter to the server-authenticated peer and revoke on leave.
 */
const MAX_BYTES=256;
const encoder=new TextEncoder();
const safeRevision=n=>Number.isSafeInteger(n)&&n>=0;
function decode(value){
 if(typeof value!=='string'||encoder.encode(value).byteLength>MAX_BYTES)return null;
 let frame;
 try{frame=JSON.parse(value);}catch{return null;}
 if(!frame||Array.isArray(frame)||typeof frame!=='object')return null;
 const keys=Object.keys(frame);
 return keys.length===2&&Object.hasOwn(frame,'type')&&
  Object.hasOwn(frame,'revision')&&frame.type==='applied-revision'&&
  safeRevision(frame.revision)?frame:null;
}
function ensureChannel(channel){
 if(typeof channel?.addEventListener!=='function'||
  typeof channel?.removeEventListener!=='function'||
  typeof channel?.send!=='function')throw new TypeError('Verified RTC channel required');
}
/** Player's local onApplied callback calls send() only AFTER its reducer succeeds. */
export function createArubaPlayerRevisionReceiptSender({channel,onError=()=>{}}){
 ensureChannel(channel);
 if(typeof onError!=='function')throw new TypeError('Error observer required');
 let closed=false,last=-1;
 function send({type,revision}={}){
  if(closed||channel.readyState!=='open'||!safeRevision(revision)||
   !['initial-snapshot','visible-delta'].includes(type)||revision<=last)
   return false;
  try{
   channel.send(JSON.stringify({type:'applied-revision',revision}));
   last=revision;
   return true;
  }catch(error){try{onError(error);}catch{}return false;}
 }
 function close(){closed=true;}
 channel.addEventListener('close',close);
 channel.addEventListener('error',close);
 return Object.freeze({
  send,
  close(){if(closed)return;close();channel.removeEventListener('close',close);
   channel.removeEventListener('error',close);},
  get lastSentRevision(){return last;},
 });
}
/**
 * GM-side receive listener bound to a verified peer generation.
 * Any user claim in the message is rejected by the strict schema.
 * Acknowledgment policy is separately checked by the tracker each time.
 */
export function attachArubaVerifiedGmRevisionReceipt({
 channel,authenticatedUserId,verifiedCampaignId,peerId,
 tracker,onError=()=>{},
}){
 ensureChannel(channel);
 if(typeof authenticatedUserId!=='string'||!authenticatedUserId||
  typeof verifiedCampaignId!=='string'||!verifiedCampaignId||
  typeof peerId!=='string'||!peerId||
  typeof tracker?.acknowledge!=='function'||typeof tracker?.revoke!=='function'||
  typeof onError!=='function')throw new TypeError('Verified peer and receipt tracker required');
 let closed=false;
 const receive=e=>{
  if(closed||channel.readyState!=='open')return;
  const frame=decode(e?.data);
  if(!frame)return; // Ignore ordinary revision/event frames and invalid controls.
  try{
   tracker.acknowledge({
    authenticatedUserId,verifiedCampaignId,peerId,revision:frame.revision,
   });
  }catch(error){try{onError(error);}catch{}}
 };
 function close(){
  if(closed)return;
  closed=true;
  channel.removeEventListener('message',receive);
  channel.removeEventListener('close',close);
  channel.removeEventListener('error',close);
  try{tracker.revoke({userId:authenticatedUserId,peerId});}
  catch(error){try{onError(error);}catch{}}
 }
 channel.addEventListener('message',receive);
 channel.addEventListener('close',close);
 channel.addEventListener('error',close);
 if(['closing','closed'].includes(channel.readyState))close();
 return Object.freeze({close,get closed(){return closed;}});
}
