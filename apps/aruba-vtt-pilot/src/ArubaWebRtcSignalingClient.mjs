/** Browser-native WebRTC connectivity probe; no game data is sent. */
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SIGNAL_KINDS=new Set(['offer','answer','ice']);
const MAX_PENDING_ICE=128;

const ICE_URL=/^(stun|stuns|turn|turns):[^/?#\s]+(?::\d{1,5})?(?:\?transport=(?:udp|tcp))?$/i;
function validateRtcConfig(config){
 if(!config||Array.isArray(config)||typeof config!=='object'||
  Object.keys(config).some(k=>!['iceServers','iceTransportPolicy'].includes(k)))
  throw new TypeError('Configurazione ICE non valida');
 const policy=config.iceTransportPolicy??'all';
 if(!['all','relay'].includes(policy))throw new TypeError('Politica ICE non valida');
 const servers=config.iceServers??[];
 if(!Array.isArray(servers)||servers.length>8)throw new TypeError('Server ICE non validi');
 let hasTurn=false;
 const safe=servers.map(server=>{
  if(!server||Array.isArray(server)||typeof server!=='object'||
   Object.keys(server).some(k=>!['urls','username','credential'].includes(k)))
   throw new TypeError('Server ICE non valido');
  const urls=typeof server.urls==='string'?[server.urls]:server.urls;
  if(!Array.isArray(urls)||!urls.length||urls.length>8||
   urls.some(u=>typeof u!=='string'||u.length>512||!ICE_URL.test(u)))
   throw new TypeError('URL STUN/TURN non valido');
  const turn=urls.some(u=>/^turns?:/i.test(u));
  const auth=typeof server.username==='string'&&server.username.length>0&&server.username.length<=512&&
   typeof server.credential==='string'&&server.credential.length>0&&server.credential.length<=512;
  if(turn&&!auth)throw new TypeError('TURN richiede credenziali temporanee');
  if(!turn&&(server.username!==undefined||server.credential!==undefined))
   throw new TypeError('Credenziali STUN non previste');
  hasTurn ||=turn;
  return turn?{urls:[...urls],username:server.username,credential:server.credential}:{urls:[...urls]};
 });
 if(policy==='relay'&&!hasTurn)throw new TypeError('Modalità relay senza server TURN');
 return {iceTransportPolicy:policy,iceServers:safe};
}
async function safeIceRoute(pc){
 if(typeof pc.getStats!=='function')return 'unknown';
 try{
  const stats=await pc.getStats();
  const reports=Array.from(stats.values());
  let pair=null;
  const transport=reports.find(s=>s.type==='transport'&&s.selectedCandidatePairId);
  if(transport)pair=stats.get(transport.selectedCandidatePairId);
  if(!pair)pair=reports.find(s=>s.type==='candidate-pair'&&s.nominated&&s.state==='succeeded');
  if(!pair)return 'unknown';
  const local=stats.get(pair.localCandidateId),remote=stats.get(pair.remoteCandidateId);
  if(!local||!remote)return 'unknown';
  if(local.candidateType==='relay'||remote.candidateType==='relay')return 'relay';
  if(['host','srflx','prflx'].includes(local.candidateType)&&
     ['host','srflx','prflx'].includes(remote.candidateType))return 'direct';
  return 'unknown';
 }catch{return 'unknown';}
}

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
 const validatedRtcConfig=validateRtcConfig(rtcConfig);
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
  const pc=new PeerConnectionCtor(validatedRtcConfig);
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
   if(!r.remote){
    if(r.pending.length>=MAX_PENDING_ICE){
     onError(new Error('Troppi candidati ICE in attesa'));
     removePeer(id);
     return;
    }
    r.pending.push(payload.candidate);return;
   }
   if(valid())await r.pc.addIceCandidate(payload.candidate);return;
  }
  if(kind==='offer'&&role==='player'){
   if(typeof payload.sdp!=='string'||r.remote)return;
   await r.pc.setRemoteDescription({type:'offer',sdp:payload.sdp});
   if(!valid())return;
   r.remote=true;
   for(const candidate of r.pending.splice(0)){
    if(!valid())return;
    await r.pc.addIceCandidate(candidate);
   }
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
   for(const candidate of r.pending.splice(0)){
    if(!valid())return;
    await r.pc.addIceCandidate(candidate);
   }
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
  get peerCount(){return peers.size;},
  async inspectConnections(){
   // Never expose candidate addresses, TURN credentials or raw SDP.
   const snapshot=[...peers.entries()];
   const summary=await Promise.all(snapshot.map(async([peerId,record])=>({
    peerId,route:await safeIceRoute(record.pc),
    iceState:String(record.pc.iceConnectionState??'unknown'),
    connectionState:String(record.pc.connectionState??'unknown'),
   })));
   return summary.filter(item=>peers.has(item.peerId)&&
    peers.get(item.peerId)?.pc===snapshot.find(([id])=>id===item.peerId)?.[1].pc);
  }});
}
