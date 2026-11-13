/**
 * Opt-in initial state synchronization gate for an authenticated GM peer.
 * No persistence, no UI, no Supabase, no default authorization bypass.
 *
 * The loader MUST return a player-scoped source snapshot together with a
 * monotonically increasing revision. An explicit trusted projection callback
 * must return an authorized payload; the default denies all snapshots.
 *
 * This queues live outbound events while the snapshot is loading; if the
 * queue grows too large or any check fails, it closes instead of risking a
 * partial state. It does NOT yet solve revision-based delta de-duplication
 * or large snapshot chunking: those remain requirements before VTT rollout.
 */
const MAX_FRAME_BYTES=60000;
const MAX_PENDING=128;
const MAX_QUEUE_BYTES=512000;
const encode=new TextEncoder();

function cloneJson(value){
 let data;
 try{data=JSON.stringify(value);}catch{return null;}
 if(typeof data!=='string'||encode.encode(data).byteLength>MAX_FRAME_BYTES)return null;
 try{return JSON.parse(data);}catch{return null;}
}
export function createArubaInitialSnapshotGate({
 channel,campaignId,peerId,userId,loadSnapshot,
 projectVisibleSnapshot=()=>null,onError=()=>{},onClosed=()=>{},
}){
 if(!channel||typeof channel.send!=='function'||
  typeof channel.addEventListener!=='function'||
  typeof channel.removeEventListener!=='function'||
  typeof loadSnapshot!=='function'||typeof projectVisibleSnapshot!=='function'||
  typeof onError!=='function'||typeof onClosed!=='function')throw new TypeError('Snapshot gate dependencies required');
 let status='pending',bytes=0;
 const queued=[];
 const isLive=()=>status!=='closed'&&channel.readyState==='open';
 const stop=error=>{
  if(status==='closed')return;
  status='closed';queued.length=0;bytes=0;
  channel.removeEventListener('close',onClose);
  channel.removeEventListener('error',onClose);
  if(error)try{onError(error);}catch{}
  try{onClosed();}catch{}
  try{channel.close?.();}catch{}
 };
 const onClose=()=>stop();
 channel.addEventListener('close',onClose);
 channel.addEventListener('error',onClose);
 const send=data=>{
  if(!isLive())return false;
  if(typeof data!=='string')return false;
  const size=encode.encode(data).byteLength;
  if(size>MAX_FRAME_BYTES)return false;
  if(status==='pending'){
   if(queued.length>=MAX_PENDING||bytes+size>MAX_QUEUE_BYTES){
    stop(new Error('Snapshot delta queue overflow'));return false;
   }
   queued.push(data);bytes+=size;return true;
  }
  try{channel.send(data);return true;}catch(error){stop(error);return false;}
 };
 const start=async()=>{
  if(!isLive())return false;
  try{
   // No remote-provided envelope values are passed to trusted callbacks.
   const raw=await loadSnapshot({campaignId,peerId,userId});
   if(!isLive()||status!=='pending')return false;
   if(!raw||!Number.isSafeInteger(raw.revision)||raw.revision<0)
    throw new Error('Missing initial snapshot revision');
   const source=cloneJson(raw.payload);
   if(!source||typeof source!=='object'||Array.isArray(source))
    throw new Error('Invalid or oversized source snapshot');
   const projection=await projectVisibleSnapshot({
    campaignId,peerId,userId,revision:raw.revision,
    snapshot:source,
   });
   if(!isLive()||status!=='pending')return false;
   if(!projection||Array.isArray(projection)||typeof projection!=='object')
    throw new Error('Initial snapshot visibility not approved');
   const payload=cloneJson(projection);
   if(!payload)throw new Error('Invalid or oversized initial snapshot');
   const wire=JSON.stringify({type:'initial-snapshot',revision:raw.revision,payload});
   if(encode.encode(wire).byteLength>MAX_FRAME_BYTES)
    throw new Error('Initial snapshot frame is too large');
   channel.send(wire);
   while(queued.length){
    if(!isLive())return false;
    const delta=queued.shift();
    bytes-=encode.encode(delta).byteLength;
    channel.send(delta);
   }
   if(!isLive())return false;
   status='ready';
   return true;
  }catch(error){stop(error);return false;}
 };
 return Object.freeze({
  send,start,close:()=>stop(),
  get status(){return status;},
  get pendingEvents(){return queued.length;},
 });
}
