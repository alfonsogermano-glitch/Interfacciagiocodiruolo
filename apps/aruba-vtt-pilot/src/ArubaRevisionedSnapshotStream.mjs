/**
 * Experimental, opt-in GM-owned per-player revisioned snapshot stream.
 * Not wired into the production VTT or the unrevisioned broadcast router.
 *
 * Contract: the source provides an atomically consistent snapshot at revision N
 * and every subsequently VISIBLE event has a contiguous per-player revision
 * N+1, N+2, ... . Never derive these revisions from untrusted RTC payloads.
 * Private GM events MUST NOT acquire revisions in this visible stream.
 * A missing revision is fatal: no silent replay, guess or fallback.
 */
const encoder=new TextEncoder();
const MAX_FRAME_BYTES=60000;
const MAX_BUFFERED=128;
const MAX_BUFFER_BYTES=512000;
const safeRevision=n=>Number.isSafeInteger(n)&&n>=0;
function jsonCopy(value){
 try {return JSON.parse(JSON.stringify(value));}catch{return null;}
}
function encodeFrame(value){
 let string;
 try{string=JSON.stringify(value);}catch{return null;}
 if(typeof string!=='string'||encoder.encode(string).length>MAX_FRAME_BYTES)return null;
 return string;
}
export function createArubaRevisionedSnapshotStream({
 channel,campaignId,userId,peerId,loadSnapshot,projectVisibleSnapshot,
 onError=()=>{},onClosed=()=>{},
}){
 if(!channel||typeof channel.send!=='function'||
  typeof channel.addEventListener!=='function'||
  typeof channel.removeEventListener!=='function'||
  typeof loadSnapshot!=='function'||typeof projectVisibleSnapshot!=='function'||
  typeof onError!=='function'||typeof onClosed!=='function')
  throw new TypeError('Trusted revision stream dependencies required');
 let status='pending',revision=null,bufferBytes=0,startPromise=null,draining=false;
 const buffered=new Map();
 const alive=()=>status!=='closed'&&channel.readyState==='open';
 const close=(error)=>{
  if(status==='closed')return;
  status='closed';buffered.clear();bufferBytes=0;
  channel.removeEventListener('close',onChannelClose);
  channel.removeEventListener('error',onChannelClose);
  if(error){try{onError(error);}catch{}}
  try{onClosed();}catch{}
  try{channel.close?.();}catch{}
 };
 function onChannelClose(){close();}
 channel.addEventListener('close',onChannelClose);
 channel.addEventListener('error',onChannelClose);
 function sendEncoded(wire){
  if(!alive())return false;
  try{channel.send(wire);return alive();}
  catch(e){close(e);return false;}
 }
 function drain(){
  // A DataChannel mock or host callback may synchronously publish more events
  // during send(). A single drain owner preserves contiguous ordering.
  if(draining)return alive();
  draining=true;
  try{
   while(alive()&&buffered.size){
    const next=revision+1;
    if(!safeRevision(next)||!buffered.has(next)){
     close(new Error('Missing visible delta revision'));return false;
    }
    const entry=buffered.get(next);
    buffered.delete(next);bufferBytes-=entry.size;
    // Reserve the revision before any re-entrant channel callback executes.
    revision=next;
    if(!sendEncoded(entry.wire))return false;
   }
   return alive();
  }finally{draining=false;}
 }
 function publishVisibleDelta({revision:nextRevision,event,payload}={}){
  if(!alive())return false;
  if(!safeRevision(nextRevision)||typeof event!=='string'||!event||
     !payload||typeof payload!=='object'||Array.isArray(payload)){
   close(new Error('Invalid revisioned visible delta'));return false;
  }
  // No authorization here. Caller must project and authorize each event
  // before it reaches this trusted per-player transport.
  const wire=encodeFrame({type:'visible-delta',revision:nextRevision,event,payload});
  if(!wire){close(new Error('Invalid or oversized visible delta'));return false;}
  if(revision!==null&&nextRevision<=revision)return true;
  if(buffered.has(nextRevision)){
   if(buffered.get(nextRevision).wire!==wire){
    close(new Error('Conflicting delta revision'));return false;
   }
   return true;
  }
  const size=encoder.encode(wire).length;
  if(buffered.size>=MAX_BUFFERED||bufferBytes+size>MAX_BUFFER_BYTES){
   close(new Error('Revision buffer overflow'));return false;
  }
  buffered.set(nextRevision,{wire,size});bufferBytes+=size;
  if(status==='ready')return drain();
  return true;
 }
 async function begin(){
  if(startPromise)return startPromise;
  if(!alive()||status!=='pending')return false;
  startPromise=(async()=>{
   try{
    const result=await loadSnapshot({campaignId,userId,peerId});
    if(!alive())return false;
    if(!result||!safeRevision(result.revision))
     throw new Error('Snapshot missing trustworthy revision');
    const raw=jsonCopy(result.payload);
    if(!raw||typeof raw!=='object'||Array.isArray(raw))
     throw new Error('Invalid source snapshot');
    const projection=await projectVisibleSnapshot({
     campaignId,userId,peerId,revision:result.revision,snapshot:raw,
    });
    if(!alive())return false;
    const visible=jsonCopy(projection);
    if(!visible||typeof visible!=='object'||Array.isArray(visible))
     throw new Error('Visible snapshot denied');
    const snapshotFrame=encodeFrame({
     type:'initial-snapshot',revision:result.revision,payload:visible,
    });
    if(!snapshotFrame)throw new Error('Visible snapshot too large');
    revision=result.revision;
    // Drop events already included in the atomically consistent snapshot.
    for(const [number,entry] of buffered){
     if(number<=revision){buffered.delete(number);bufferBytes-=entry.size;}
    }
    // Fail BEFORE sending a known-incomplete initial state.
    const pendingRevisions=[...buffered.keys()].sort((a,b)=>a-b);
    let expected=revision;
    for(const number of pendingRevisions){
     if(!safeRevision(expected+1)||number!==expected+1)
      throw new Error('Gap between snapshot and visible events');
     expected=number;
    }
    if(!sendEncoded(snapshotFrame))return false;
    status='ready';
    return drain();
   }catch(error){close(error);return false;}
  })();
  return startPromise;
 }
 return Object.freeze({
  begin,publishVisibleDelta,close:()=>close(),
  get status(){return status;},
  get revision(){return revision;},
  get bufferedEvents(){return buffered.size;},
 });
}
