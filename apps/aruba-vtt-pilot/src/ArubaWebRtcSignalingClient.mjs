/** Browser-native WebRTC connectivity probe; no game data is sent. */
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SIGNAL_KINDS=new Set(['offer','answer','ice']);
export function createArubaWebRtcSignalingClient({
 campaignId,role,WebSocketCtor,PeerConnectionCtor,origin,
 rtcConfig={},onState=()=>{},onError=()=>{},
}){
 if(!UUID.test(campaignId)||!['host','player'].includes(role)||
  typeof WebSocketCtor!=='function'||typeof PeerConnectionCtor!=='function'||
  typeof origin!=='string'||!origin.startsWith('https://')||
  new URL(origin).origin!==origin||
  typeof onState!=='function'||typeof onError!=='function')
  throw new TypeError('Invalid signaling client configuration');
 const peers=new Map();
 let ws=null,active=false,connected=false,localPeerId=null,chain=Promise.resolve();
 let generation=0;
 const emit=(state,peerId)=>onState({state,peerId});
 const transmit=(kind,payload,peerId)=>{
  if(!connected||ws?.readyState!==1||!SIGNAL_KINDS.has(kind))return false;
  const message={type:'signal',kind,payload};
  if(role==='host'){
   if(!UUID.test(peerId??''))return false;
   message.targetPeerId=peerId;
  }
  ws.send(JSON.stringify(message));return true;
 };
 function removePeer(id){
  const record=peers.get(id);
  if(!record)return;
  peers.delete(id);
  try{record.channel?.close();}catch{}
  try{record.pc.close();}catch{}
  emit('peer-left',id);
 }
 function peer(id){
  let record=peers.get(id);
  if(record)return record;
  const pc=new PeerConnectionCtor(rtcConfig);
  record={pc,pending:[],remote:false,channel:null};
  peers.set(id,record);
  pc.onicecandidate=event=>{
   if(!active||peers.get(id)!==record||!event.candidate)return;
   const candidate=event.candidate.toJSON?.()??event.candidate;
   transmit('ice',{candidate},id);
  };
  pc.onconnectionstatechange=()=>{
   if(peers.get(id)!==record)return;
   emit(pc.connectionState==='connected'?'peer-connected':
    pc.connectionState==='failed'?'peer-failed':'peer-state',id);
   if(['closed','failed'].includes(pc.connectionState))removePeer(id);
  };
  // No user data or gameplay events are forwarded by this module.
  pc.ondatachannel=event=>{event.channel.onmessage=()=>{};};
  return record;
 }
 async function accept(id,kind,payload,epoch){
  if(!active||!UUID.test(id)||!payload||typeof payload!=='object'||Array.isArray(payload))return;
  const r=peer(id);
  const valid=()=>active&&generation===epoch&&peers.get(id)===r;
  if(kind==='ice'){
   if(!payload.candidate||typeof payload.candidate!=='object')return;
   if(!r.remote){r.pending.push(payload.candidate);return;}
   if(valid())await r.pc.addIceCandidate(payload.candidate);return;
  }
  if(kind==='offer'&&role==='player'){
   if(typeof payload.sdp!=='string'||r.remote)return;
   await r.pc.setRemoteDescription({type:'offer',sdp:payload.sdp});
   if(!valid())return;
   r.remote=true;
   for(const candidate of r.pending.splice(0))await r.pc.addIceCandidate(candidate);
   const answer=await r.pc.createAnswer();
   if(!valid())return;
   await r.pc.setLocalDescription(answer);
   if(!valid())return;
   transmit('answer',{sdp:r.pc.localDescription?.sdp??answer.sdp},id);
  }else if(kind==='answer'&&role==='host'){
   if(typeof payload.sdp!=='string'||r.remote)return;
   await r.pc.setRemoteDescription({type:'answer',sdp:payload.sdp});
   if(!valid())return;
   r.remote=true;
   for(const candidate of r.pending.splice(0))await r.pc.addIceCandidate(candidate);
  }
 }
 async function handle(message,epoch){
  if(!active||generation!==epoch||!message||typeof message!=='object'||Array.isArray(message))return;
  if(message.type==='ready'&&message.role===role&&UUID.test(message.peerId??'')){
   connected=true;localPeerId=message.peerId;emit('ready',localPeerId);return;
  }
  if(!connected)return;
  if(message.type==='peer-left'&&role==='host'&&UUID.test(message.peerId??'')){
   removePeer(message.peerId);return;
  }
  if(message.type==='peer-joined'&&role==='host'&&UUID.test(message.peerId??'')){
   const id=message.peerId;
   if(peers.has(id))return; // Duplicate peer-joined never renegotiates.
   const r=peer(id);
   // Connectivity probe only: no outgoing application message path.
   r.channel=r.pc.createDataChannel('hollowgate-connection-probe');
   r.channel.onmessage=()=>{};
   const offer=await r.pc.createOffer();
   if(!active||generation!==epoch||peers.get(id)!==r)return;
   await r.pc.setLocalDescription(offer);
   if(!active||generation!==epoch||peers.get(id)!==r)return;
   transmit('offer',{sdp:r.pc.localDescription?.sdp??offer.sdp},id);
   return;
  }
  if(message.type==='signal'&&SIGNAL_KINDS.has(message.kind)){
   if(role==='host'&&UUID.test(message.peerId??'')&&peers.has(message.peerId))
    await accept(message.peerId,message.kind,message.payload,epoch);
   else if(role==='player'&&!Object.hasOwn(message,'peerId'))
    await accept(campaignId,message.kind,message.payload,epoch);
  }
 }
 function disconnect(){
  generation+=1;
  chain=Promise.resolve();
  active=false;connected=false;localPeerId=null;
  for(const id of [...peers.keys()])removePeer(id);
  const current=ws;ws=null;
  if(current){current.onmessage=null;current.onclose=null;current.onerror=null;current.close();}
 }
 function connect(){
  if(active)throw new Error('Already connected');
  generation+=1;
  const epoch=generation;
  chain=Promise.resolve();
  active=true;
  const url=new URL('/vtt/signaling',origin);
  url.protocol='wss:';
  url.searchParams.set('campaignId',campaignId);url.searchParams.set('role',role);
  const socket=new WebSocketCtor(url.toString());ws=socket;
  socket.onmessage=event=>{
   let message;
   try{message=JSON.parse(event.data);}catch{return;}
   chain=chain.then(()=>{
    if(active&&generation===epoch&&ws===socket)return handle(message,epoch);
   }).catch(error=>{
    if(active&&generation===epoch&&ws===socket)onError(error);
   });
  };
  socket.onclose=()=>{if(ws===socket){disconnect();emit('disconnected',null);}};
  socket.onerror=()=>{if(ws===socket)emit('connection-error',null);};
  return socket;
 }
 return Object.freeze({connect,disconnect,get connected(){return connected;},
  get peerCount(){return peers.size;}});
}
