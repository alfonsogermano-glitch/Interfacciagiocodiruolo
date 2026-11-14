/** Campaign-scoped, GM-authoritative snapshot replication over an established WebRTC channel.
 * This module deliberately has no storage or signaling dependencies. */
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX=60000;
const MAX_DEPTH=32;
const MAX_NODES=10000;
function safeShape(root){
 let count=0;const stack=[[root,0]];
 while(stack.length){
  const [value,depth]=stack.pop();
  if(++count>MAX_NODES||depth>MAX_DEPTH)throw new TypeError('Game snapshot too complex');
  if(value&&typeof value==='object'){
   if(Object.hasOwn(value,'__proto__')||Object.hasOwn(value,'constructor')||Object.hasOwn(value,'prototype'))
    throw new TypeError('Unsafe game snapshot key');
   for(const key of Object.keys(value))stack.push([value[key],depth+1]);
  }
 }
}

function copy(value){
 const encoded=JSON.stringify(value);
 if(typeof encoded!=='string'||encoded.length>MAX)throw new TypeError('Invalid game snapshot');
 const result=JSON.parse(encoded);
 if(!result||typeof result!=='object'||Array.isArray(result))throw new TypeError('Game snapshot must be an object');
 safeShape(result);
 return result;
}
/** GM owns revision and state; players may request refresh but never replace state. */
export function createGameStateReplicator({campaignId,role,send,onSnapshot=()=>{}}){
 if(!UUID.test(campaignId)||!['host','player'].includes(role)||typeof send!=='function'||typeof onSnapshot!=='function')
  throw new TypeError('Invalid replication context');
 let revision=0,state=null,closed=false;
 function publish(snapshot){
  if(closed||role!=='host')return false;
  const next=copy(snapshot);
  if(revision>=Number.MAX_SAFE_INTEGER)throw new RangeError('Revision exhausted');
  revision++;state=next;onSnapshot({revision,state:copy(state)});
  send({kind:'snapshot',campaignId,revision,state:copy(state)});
  return true;
 }
 function receive({peerId,payload}={}){
  if(closed||!payload||typeof payload!=='object'||Array.isArray(payload)||payload.campaignId!==campaignId)return false;
  if(role==='host'){
   if(payload.kind!=='request-snapshot'||!UUID.test(peerId??'')||!state)return false;
   return send({kind:'snapshot',campaignId,revision,state:copy(state)},peerId)!==false;
  }
  // Player transport identifies its single GM channel by campaignId, never by a player UUID.
  if(peerId!==campaignId||payload.kind!=='snapshot'||!Number.isSafeInteger(payload.revision)||payload.revision<=revision||payload.revision<1)return false;
  let next;try{next=copy(payload.state);}catch{return false;}
  revision=payload.revision;state=next;onSnapshot({revision,state:copy(state)});return true;
 }
 return {
  publish,
  receive,
  requestSnapshot(){return !closed&&role==='player'&&send({kind:'request-snapshot',campaignId})!==false;},
  getSnapshot(){return state?{revision,state:copy(state)}:null;},
  close(){closed=true;state=null;},
 };
}
