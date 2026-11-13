/**
 * Isolated, GM-authoritative per-connection visible event producer.
 * Opt-in experiment: NOT connected to the normal Hollowgate shell or VPS.
 *
 * A single synchronous commit prepares the next canonical state and ALL
 * player-visible projections before publishing anything. Every registered
 * player has its own revision clock, incremented ONLY for visible events.
 * Registered peers are server-verified inputs, never network-supplied claims.
 */
import {isBroadcastEvent} from '../../../src/services/realtime/campaignChannelContract.ts';
import {createArubaRevisionedSnapshotStream} from './ArubaRevisionedSnapshotStream.mjs';

const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_JSON_BYTES=60000;
const encoder=new TextEncoder();
function copyData(value){
 let json;
 try{json=JSON.stringify(value);}catch{return null;}
 if(typeof json!=='string'||encoder.encode(json).length>MAX_JSON_BYTES)return null;
 try{return JSON.parse(json);}catch{return null;}
}
const object=value=>!!value&&typeof value==='object'&&!Array.isArray(value);
function requireObject(value,label){
 const cloned=copyData(value);
 if(!object(cloned))throw new Error(label+' must be bounded JSON object');
 return cloned;
}
export function createArubaGmRevisionedCampaignSource({
 campaignId,gmUserId,initialState,
 applyGmEvent,projectVisibleSnapshot,projectVisibleEvent,onError=()=>{},
}){
 if(!UUID.test(campaignId)||!UUID.test(gmUserId)||
  typeof applyGmEvent!=='function'||typeof projectVisibleSnapshot!=='function'||
  typeof projectVisibleEvent!=='function'||typeof onError!=='function')
  throw new TypeError('Verified GM campaign and explicit projections required');
 let state=requireObject(initialState,'Initial authoritative state');
 const peers=new Map();
 let generation=0,closed=false,committing=false;
 const active=record=>!closed&&peers.get(record.peerId)===record&&record.generation===generation;
 const snapshot=record=>{
  if(!active(record))throw new Error('Revoked peer');
  const projected=projectVisibleSnapshot({
   campaignId,userId:record.userId,peerId:record.peerId,
   state:requireObject(state,'Authoritative state'),
  });
  if(!active(record))throw new Error('Revoked during projection');
  return {revision:record.revision,payload:requireObject(projected,'Player-scoped snapshot')};
 };
 const revoke=record=>{
  if(!active(record))return;
  peers.delete(record.peerId);
  const stream=record.stream;
  record.stream=null;
  try{stream?.close();}catch(error){try{onError(error);}catch{}}
 };
 function registerVerifiedPeer({peerId,userId,verifiedCampaignId}){
  if(closed||!UUID.test(peerId)||!UUID.test(userId)||userId===gmUserId||
   verifiedCampaignId!==campaignId||peers.has(peerId))return null;
  const record={peerId,userId,revision:0,generation,stream:null};
  peers.set(peerId,record);
  // A snapshot of this state and its revision are always read together.
  // On the synchronous JS event loop, no GM commit can interleave this call.
  return Object.freeze({
   snapshot:()=>snapshot(record),
   get revision(){return active(record)?record.revision:null;},
   close:()=>revoke(record),
   attachChannel(channel){
    if(!active(record)||record.stream)return null;
    const stream=createArubaRevisionedSnapshotStream({
     channel,campaignId,userId,peerId,
     loadSnapshot:()=>snapshot(record),
     projectVisibleSnapshot:({snapshot:visible})=>visible,
     onClosed:()=>revoke(record),
     onError,
    });
    record.stream=stream;
    // Register the source-to-stream feed BEFORE the asynchronous snapshot
    // begins; all commits during loading are buffered by the stream.
    void stream.begin().then(ok=>{if(!ok)revoke(record);}).catch(error=>{
     try{onError(error);}catch{}revoke(record);
    });
    return stream;
   },
  });
 }
 function commit({authenticatedGmUserId,event,payload}={}){
  if(closed||committing||authenticatedGmUserId!==gmUserId||
   !isBroadcastEvent(event))return false;
  let sourceEvent;
  try{sourceEvent=requireObject(payload,'GM event');}catch{return false;}
  committing=true;
  try{
   // Prepare all projections BEFORE assigning revisions or notifying peers.
   // If a policy throws or returns invalid data the commit is rejected whole.
   const next=requireObject(applyGmEvent({
    campaignId,event,payload:sourceEvent,
    state:requireObject(state,'Authoritative state'),
   }),'Next authoritative state');
   const plans=[];
   for(const record of peers.values()){
    if(!active(record))continue;
    const projection=projectVisibleEvent({
     campaignId,userId:record.userId,peerId:record.peerId,
     event,payload:requireObject(sourceEvent,'GM event'),
     state:requireObject(next,'Next authoritative state'),
     previousState:requireObject(state,'Previous authoritative state'),
    });
    if(projection===null)continue;
    if(!object(projection)||!isBroadcastEvent(projection.event))
     throw new Error('Player event not explicitly authorized');
    const visible=requireObject(projection.payload,'Player-visible delta');
    if(!Number.isSafeInteger(record.revision+1))
     throw new Error('Visible revision overflow');
    plans.push({record,revision:record.revision+1,event:projection.event,payload:visible});
   }
   if(closed)return false;
   state=next;
   // Revisions are only assigned to events visible to this specific peer.
   for(const plan of plans){
    const {record,revision,event:eventName,payload:visible}=plan;
    if(!active(record))continue;
    record.revision=revision;
    if(record.stream&&!record.stream.publishVisibleDelta({
     revision,event:eventName,payload:visible,
    }))revoke(record);
   }
   return true;
  }catch(error){
   try{onError(error);}catch{}
   return false;
  }finally{committing=false;}
 }
 function close(){
  if(closed)return;
  for(const record of [...peers.values()])revoke(record);
  closed=true;generation++;
 }
 return Object.freeze({
  registerVerifiedPeer,commit,close,
  get peerCount(){return peers.size;},
  get closed(){return closed;},
 });
}
