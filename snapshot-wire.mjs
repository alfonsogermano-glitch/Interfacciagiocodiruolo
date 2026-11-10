// Bounded PeerJS/WebRTC snapshot transport. No gameplay persistence or server dependency.
// Split potentially large campaign snapshots into small JSON packets.
const MAX_CHARS = 90000;
const MAX_PARTS = 48;
const PART_CHARS = 2400;
const MAX_ACTIVITY = 48;

export function prepareSnapshot(state) {
 if(!state || typeof state!=='object' || !state.tokens || !Array.isArray(state.activity))
  throw Error('Invalid campaign snapshot');
 // The GM keeps the complete history locally. Only a bounded recent view
 // is sent over the realtime channel to avoid SCTP/Android message-size limits.
 const view={...state,activity:state.activity.slice(-MAX_ACTIVITY)};
 let serialized=JSON.stringify(view);
 while(serialized.length>MAX_CHARS && view.activity.length){
  view.activity.shift();serialized=JSON.stringify(view);
 }
 if(serialized.length>MAX_CHARS)throw Error('Snapshot exceeds transport limit');
 return {view,serialized};
}
export function snapshotPackets(state,id) {
 if(typeof id!=='string'||!/^[-a-zA-Z0-9]{4,80}$/.test(id))throw Error('Invalid transfer id');
 const {serialized}=prepareSnapshot(state);
 if(serialized.length<=PART_CHARS)return [{kind:'snapshot',state:JSON.parse(serialized)}];
 const total=Math.ceil(serialized.length/PART_CHARS);
 if(total>MAX_PARTS)throw Error('Too many snapshot packets');
 return Array.from({length:total},(_,index)=>({
  kind:'snapshot-part',id,index,total,content:serialized.slice(index*PART_CHARS,(index+1)*PART_CHARS)
 }));
}
export function createSnapshotAssembler(onSnapshot,onError=()=>{}) {
 let transfer=null;
 const accept=packet=>{
  if(!packet||packet.kind!=='snapshot-part')return false;
  const {id,index,total,content}=packet;
  if(typeof id!=='string'||id.length>80||!/^[-a-zA-Z0-9]{4,80}$/.test(id)||
     !Number.isInteger(index)||!Number.isInteger(total)||
     total<1||total>MAX_PARTS||index<0||index>=total||
     typeof content!=='string'||content.length===0||content.length>PART_CHARS){
   onError('Pacchetto snapshot non valido');return true;
  }
  if(!transfer || transfer.id!==id){
   transfer={id,total,parts:new Array(total),count:0};
  }
  if(transfer.total!==total){transfer=null;onError('Snapshot incoerente');return true;}
  if(transfer.parts[index]===undefined){
   transfer.parts[index]=content;transfer.count++;
  }
  if(transfer.count===total){
   const combined=transfer.parts.join('');
   transfer=null;
   if(combined.length>MAX_CHARS){onError('Snapshot troppo grande');return true;}
   try{onSnapshot(JSON.parse(combined));}
   catch(e){onError('Errore ricomposizione snapshot: '+e.message);}
  }
  return true;
 };
 return {accept,reset(){transfer=null}};
}
