// Versioned transport state for the forthcoming React VTT adapter.
// The host, not the client, is the authority. No standalone persistence here.
export function createVttClient({send,onState=()=>{},onAck=()=>{},onError=()=>{}}){
 let sequence=-1,state=null,awaitingResync=false,campaignId='demo';
 const validSequence=n=>Number.isSafeInteger(n)&&n>=0;
 const sendFrame=frame=>send({...frame,version:1,campaignId});
 const snapshot=frame=>{
  if(!validSequence(frame.sequence)||!frame.state||typeof frame.state!=='object')return;
  if(frame.sequence<sequence)return;
  sequence=frame.sequence;
  state=structuredClone(frame.state);
  awaitingResync=false;
  onState(state,sequence);
 };
 const patch=frame=>{
  if(!validSequence(frame.sequence)||!frame.changes||typeof frame.changes!=='object')return;
  if(sequence<0||frame.sequence>sequence+1){
   if(!awaitingResync){awaitingResync=true;sendFrame({type:'vtt:resync',lastSequence:Math.max(0,sequence)})}
   return;
  }
  if(frame.sequence<=sequence)return;
  if(awaitingResync)return;
  const changes=frame.changes;
  if(changes.scene!==undefined)state.scene=structuredClone(changes.scene);
  if(changes.token){
   const token=changes.token;
   if(typeof token.tokenId!=='string'||!Array.isArray(state.tokens))return;
   const i=state.tokens.findIndex(t=>t.tokenId===token.tokenId);
   if(i===-1)state.tokens.push(structuredClone(token));
   else state.tokens[i]=structuredClone(token);
  }
  sequence=frame.sequence;
  onState(structuredClone(state),sequence);
 };
 return {
  accept(frame){
   if(!frame||frame.version!==1||frame.campaignId!==campaignId)return false;
   if(frame.type==='vtt:snapshot'){snapshot(frame);return true}
   if(frame.type==='vtt:patch'){patch(frame);return true}
   if(frame.type==='vtt:ack'){onAck(frame);return true}
   if(frame.type==='vtt:error'){onError(frame);return true}
   return false;
  },
  command(command,payload,eventId){
   if(typeof eventId!=='string'||!eventId)return false;
   sendFrame({type:'vtt:command',eventId,command,payload});
   return true;
  },
  requestResync(){sendFrame({type:'vtt:resync',lastSequence:Math.max(0,sequence)})},
  getState(){return state===null?null:structuredClone(state)},
  getSequence(){return sequence},
  reset(){sequence=-1;state=null;awaitingResync=false}
 };
}
