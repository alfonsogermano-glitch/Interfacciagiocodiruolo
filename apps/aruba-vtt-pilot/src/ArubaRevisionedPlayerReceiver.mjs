/**
 * Player-side receiver for the experimental GM revisioned stream.
 * Not mounted in Hollowgate's original UI. A trusted caller must only
 * attach this to the verified GM-owned RTCDataChannel.
 *
 * The receiver requires an initial snapshot for EVERY fresh channel,
 * rejects gaps/reordered updates and never guesses how to repair state.
 * Rendering callbacks are synchronous, fail-closed and must enforce
 * application-specific state schema/visibility independently.
 * Optional onApplied fires only AFTER synchronous UI state application. It
 * reports local reception only, not durable persistence or visual rendering.
 */
import {isBroadcastEvent} from '../../../src/services/realtime/campaignChannelContract.ts';

const MAX_FRAME_BYTES=60000;
const encoder=new TextEncoder();
const validRevision=value=>Number.isSafeInteger(value)&&value>=0;
const plain=value=>value!==null&&typeof value==='object'&&!Array.isArray(value);
const exact=(value,names)=>{
 const keys=Object.keys(value);
 return keys.length===names.length&&names.every(key=>Object.hasOwn(value,key));
};
function parse(data){
 if(typeof data!=='string'||encoder.encode(data).byteLength>MAX_FRAME_BYTES)
  throw new Error('Invalid or oversized revision frame');
 let value;
 try{value=JSON.parse(data);}catch{throw new Error('Invalid revision JSON');}
 if(!plain(value))throw new Error('Invalid revision envelope');
 if(value.type==='initial-snapshot'){
  if(!exact(value,['type','revision','payload'])||
   !validRevision(value.revision)||!plain(value.payload))
   throw new Error('Malformed initial snapshot');
  return value;
 }
 if(value.type==='visible-delta'){
  if(!exact(value,['type','revision','event','payload'])||
   !validRevision(value.revision)||!isBroadcastEvent(value.event)||
   !plain(value.payload))
   throw new Error('Malformed visible delta');
  return value;
 }
 throw new Error('Unknown GM revision frame');
}
export function createArubaRevisionedPlayerReceiver({
 channel,applySnapshot,applyDelta,onApplied=()=>{},onError=()=>{},onClosed=()=>{},
}){
 if(typeof channel?.addEventListener!=='function'||
  typeof channel?.removeEventListener!=='function'||
  typeof channel?.close!=='function'||
  typeof applySnapshot!=='function'||typeof applyDelta!=='function'||
  typeof onApplied!=='function'||typeof onError!=='function'||typeof onClosed!=='function')
  throw new TypeError('Verified GM channel and synchronous state adapters required');
 let status='awaiting-snapshot',revision=null,firstFrame=false;
 function close(error){
  if(status==='closed')return;
  status='closed';
  channel.removeEventListener('message',receive);
  channel.removeEventListener('close',closed);
  channel.removeEventListener('error',closed);
  if(error)try{onError(error);}catch{}
  try{onClosed();}catch{}
  try{channel.close();}catch{}
 }
 function closed(){close();}
 function receive(e){
  if(status==='closed')return;
  try{
   if(channel.readyState!=='open')throw new Error('GM channel is not open');
   const frame=parse(e?.data);
   if(status==='awaiting-snapshot'){
    if(frame.type!=='initial-snapshot')
     throw new Error('Delta received before initial state');
    firstFrame=true;
    const applied=applySnapshot({
     revision:frame.revision,payload:structuredClone(frame.payload),
    });
    if(applied!==true||status==='closed')throw new Error('Player rejected initial state');
    revision=frame.revision;status='ready';
    onApplied({type:'initial-snapshot',revision});
    return;
   }
   if(frame.type!=='visible-delta')
    throw new Error('Duplicate initial snapshot');
   // Do not replay events already applied; this also handles network
   // duplicates without notifying UI callbacks again.
   if(frame.revision<=revision)return;
   if(!validRevision(revision+1)||frame.revision!==revision+1)
    throw new Error('Missing or out-of-order visible revision');
   const applied=applyDelta({
    revision:frame.revision,event:frame.event,payload:structuredClone(frame.payload),
   });
   if(applied!==true||status==='closed')throw new Error('Player rejected visible delta');
   revision=frame.revision;
   onApplied({type:'visible-delta',revision,event:frame.event});
  }catch(error){close(error);}
 }
 channel.addEventListener('message',receive);
 channel.addEventListener('close',closed);
 channel.addEventListener('error',closed);
 if(channel.readyState==='closed'||channel.readyState==='closing')close();
 return Object.freeze({
  close:()=>close(),
  get status(){return status;},
  get revision(){return revision;},
  get hasSnapshot(){return firstFrame&&status==='ready';},
 });
}
