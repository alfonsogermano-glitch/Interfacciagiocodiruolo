import {createSignalingClient} from './signaling-client.mjs';
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
/** Browser peer lifecycle for GM-hosted sessions. Signaling carries only SDP/ICE. */
export function createWebRtcSession({origin,campaignId,role,WebSocketImpl,PeerConnectionImpl,iceServers=[],onStatus=()=>{},onData=()=>{}}){
 if(!['host','player'].includes(role)||typeof PeerConnectionImpl!=='function'||
  typeof onStatus!=='function'||typeof onData!=='function'||!Array.isArray(iceServers))
  throw new TypeError('Invalid peer session');
 const peers=new Map();let stopped=false;
 function notify(state,peerId){if(!stopped)onStatus({state,peerId});}
 function drop(id){const peer=peers.get(id);if(!peer)return;peers.delete(id);peer.channel?.close();peer.pc.close();notify('disconnected',id);}
 function channelReady(peer,channel){
  peer.channel=channel;
  channel.onopen=()=>notify('connected',peer.id);
  channel.onclose=()=>notify('channel-closed',peer.id);
  channel.onmessage=event=>{
   if(stopped||peers.get(peer.id)!==peer||typeof event.data!=='string'||event.data.length>65536)return;
   let data;try{data=JSON.parse(event.data);}catch{return;}
   if(data&&typeof data==='object'&&!Array.isArray(data)&&data.campaignId===campaignId&&
      data.type==='game'&&Object.hasOwn(data,'payload'))onData({peerId:peer.id,payload:data.payload});
  };
 }
 function makePeer(id){
  if(!UUID.test(id)||stopped)return null;
  if(peers.has(id))return peers.get(id);
  const pc=new PeerConnectionImpl({iceServers});const peer={id,pc,channel:null,pendingIce:[]};peers.set(id,peer);
  pc.onicecandidate=event=>{if(!stopped&&peers.get(id)===peer&&event.candidate)signal.send('ice',{candidate:event.candidate.toJSON?.()??event.candidate},role==='host'?id:undefined);};
  pc.onconnectionstatechange=()=>{if(['failed','closed','disconnected'].includes(pc.connectionState))drop(id);};
  if(role==='host')channelReady(peer,pc.createDataChannel('hollowgate-game',{ordered:true}));
  else pc.ondatachannel=event=>{if(event.channel.label==='hollowgate-game')channelReady(peer,event.channel);else event.channel.close();};
  return peer;
 }
 async function remote(peer,sdp){
  await peer.pc.setRemoteDescription({type:sdp.type,sdp:sdp.sdp});
  for(const candidate of peer.pendingIce.splice(0))await peer.pc.addIceCandidate(candidate);
 }
 async function onSignal(data){
  if(stopped)return;
  if(data.type==='peer-left'&&role==='host'){drop(data.peerId);return;}
  if(data.type==='peer-joined'&&role==='host'&&data.campaignId===campaignId&&UUID.test(data.peerId??'')){
   const peer=makePeer(data.peerId);if(!peer)return;
   const offer=await peer.pc.createOffer();if(stopped||peers.get(peer.id)!==peer)return;
   await peer.pc.setLocalDescription(offer);if(stopped||peers.get(peer.id)!==peer)return;
   signal.send('offer',{sdp:offer.sdp},peer.id);return;
  }
  if(data.type!=='signal'||!['offer','answer','ice'].includes(data.kind))return;
  const id=role==='host'?data.peerId:campaignId;
  if(!UUID.test(id))return;
  if(role==='host'&&data.kind==='offer'||role==='player'&&data.kind==='answer')return;
  const peer=makePeer(id);if(!peer)return;
  if(data.kind==='ice'){
   if(!data.payload?.candidate)return;
   if(!peer.pc.remoteDescription){if(peer.pendingIce.length>=128){drop(id);return;}peer.pendingIce.push(data.payload.candidate);}
   else await peer.pc.addIceCandidate(data.payload.candidate);
  }else if(typeof data.payload?.sdp==='string'){
   await remote(peer,{type:data.kind,sdp:data.payload.sdp});
   if(stopped||peers.get(peer.id)!==peer)return;
   if(role==='player'&&data.kind==='offer'){
    const answer=await peer.pc.createAnswer();if(stopped||peers.get(peer.id)!==peer)return;
    await peer.pc.setLocalDescription(answer);if(stopped||peers.get(peer.id)!==peer)return;
    signal.send('answer',{sdp:answer.sdp});
   }
  }
 }
 const signal=createSignalingClient({origin,campaignId,role,WebSocketImpl,
  onEvent:data=>{if(data.type==='ready')notify('ready',data.peerId);
   else void onSignal(data).catch(()=>{notify('negotiation-failed',data.peerId);if(role==='host'&&UUID.test(data.peerId??''))drop(data.peerId);});},
  onDisconnect:()=>{for(const id of [...peers.keys()])drop(id);notify('signaling-disconnected');},
 });
 return {
  send(payload,peerId){
   if(stopped)return false;
   if(role==='host'&&peerId!==undefined&&!UUID.test(peerId))return false;
   let message;try{message=JSON.stringify({type:'game',campaignId,payload});}catch{return false;}
   if(typeof message!=='string'||message.length>65536)return false;
   const targets=role==='host'?(peerId?[peers.get(peerId)]:[...peers.values()]):[peers.get(campaignId)];
   let sent=false;
   for(const peer of targets){if(peer?.channel?.readyState==='open'){peer.channel.send(message);sent=true;}}
   return sent;
  },
  close(){if(stopped)return;stopped=true;signal.close();for(const id of [...peers.keys()])drop(id);},
 };
}
