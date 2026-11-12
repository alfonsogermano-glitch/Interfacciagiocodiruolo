/**
 * Notes are saved independently from character sheet JSON.
 * The host detail must not close while either save queue is unfinished.
 * Pure module intentionally has no browser storage or timers.
 */
const records=new Map();
const key=(campaignId,characterId)=>campaignId+'/'+characterId;
const record=(campaignId,characterId)=>{
 const id=key(campaignId,characterId);
 let found=records.get(id);
 if(!found){found={pending:new Map(),error:null,listeners:new Set()};records.set(id,found);}
 return found;
};
const broadcast=value=>{for(const listener of value.listeners)listener(value.error);};
export function registerArubaNoteWrite(campaignId,characterId,noteId,promise){
 const current=record(campaignId,characterId);
 current.pending.set(noteId,promise);
 // Handle both outcomes without creating an unhandled rejected .finally.
 void promise.then(()=>{
  if(current.pending.get(noteId)===promise){
   current.pending.delete(noteId);current.error=null;broadcast(current);
  }
 },error=>{
  if(current.pending.get(noteId)===promise){
   current.pending.delete(noteId);
   current.error=error instanceof Error?error.message:'Salvataggio Note fallito';
   broadcast(current);
  }
 });
}
export async function awaitArubaNoteWrites(campaignId,characterId){
 const current=record(campaignId,characterId);
 const pending=[...current.pending.values()];
 const result=await Promise.allSettled(pending);
 const failure=result.find(item=>item.status==='rejected');
 if(failure)throw failure.reason;
 if(current.error)throw Error(current.error);
}
export function subscribeArubaNoteError(campaignId,characterId,listener){
 const current=record(campaignId,characterId);
 current.listeners.add(listener);
 listener(current.error);
 return ()=>current.listeners.delete(listener);
}
