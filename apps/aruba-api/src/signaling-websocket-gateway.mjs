import {randomUUID} from 'node:crypto';
import {WebSocketServer} from 'ws';

const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const TOKEN=/^[A-Za-z0-9_-]{43}$/;
const KINDS=new Set(['offer','answer','ice']);
const MAX_ICE_CANDIDATES=128;
function validCandidate(value){
 if(!value||typeof value!=='object'||Array.isArray(value))return false;
 const keys=Object.keys(value);
 if(!keys.includes('candidate')||
    keys.some(key=>!['candidate','sdpMid','sdpMLineIndex','usernameFragment'].includes(key))||
    typeof value.candidate!=='string'||value.candidate.length>8192)return false;
 if(Object.hasOwn(value,'sdpMid')&&
    value.sdpMid!==null&&(typeof value.sdpMid!=='string'||value.sdpMid.length>256))return false;
 if(Object.hasOwn(value,'sdpMLineIndex')&&value.sdpMLineIndex!==null&&
    (!Number.isInteger(value.sdpMLineIndex)||value.sdpMLineIndex<0||
     value.sdpMLineIndex>65535))return false;
 if(Object.hasOwn(value,'usernameFragment')&&value.usernameFragment!==null&&
    (typeof value.usernameFragment!=='string'||value.usernameFragment.length>256))return false;
 return true;
}
function validPayload(kind,payload){
 if(!payload||typeof payload!=='object'||Array.isArray(payload))return false;
 if(kind==='ice')return Object.keys(payload).length===1&&
  validCandidate(payload.candidate);
 return Object.keys(payload).length===1&&typeof payload.sdp==='string'&&
  payload.sdp.length>0&&payload.sdp.length<=60000;
}

function cookie(req){
 const pairs=(req.headers.cookie??'').split(';').map(s=>s.trim())
  .filter(s=>s.startsWith('__Host-hg_session='));
 if(pairs.length!==1)return null;
 const value=pairs[0].slice('__Host-hg_session='.length);
 return TOKEN.test(value)?value:null;
}
function send(ws,value){
 if(ws.readyState!==ws.OPEN)return false;
 try{ws.send(JSON.stringify(value));return true;}catch{return false;}
}
function deny(socket,code=403){
 if(socket.destroyed)return;
 try{socket.end('HTTP/1.1 '+code+' Rejected\r\nConnection: close\r\nContent-Length: 0\r\n\r\n');}
 catch{socket.destroy();}
}
/**
 * Opt-in WebRTC signaling ONLY (SDP offer/answer and ICE candidates).
 * No game events, notes, chat, campaign snapshots or TURN relay here.
 * Cookies are accepted only from the trusted upgrade boundary.
 */
export function createSignalingWebSocketGateway({server,origin,identity,revalidateIntervalMs=15000}){
 if(typeof server?.on!=='function'||typeof identity?.verify!=='function'||
  typeof origin!=='string'||!origin.startsWith('https://')||
  new URL(origin).origin!==origin||
  !Number.isSafeInteger(revalidateIntervalMs)||
  revalidateIntervalMs<10||revalidateIntervalMs>300000)
  throw new TypeError('Trusted gateway required');
 const wss=new WebSocketServer({noServer:true,maxPayload:65536,perMessageDeflate:false});
 const rooms=new Map(),clients=new Set(),sessions=new Set();
 let stopped=false;
 async function current(client){
  const proof=await identity.verify({sessionToken:client.token,
   campaignId:client.campaignId,connectionRole:client.role});
  return proof?.userId===client.userId&&proof.campaignId===client.campaignId&&
   proof.role===(client.role==='host'?'gm':'player');
 }
 function leave(client){
  if(client.left)return;
  client.left=true;clients.delete(client.ws);sessions.delete(client);
  const room=rooms.get(client.campaignId);
  if(!room)return;
  if(room.host===client){
   rooms.delete(client.campaignId);
   for(const peer of room.players.values())peer.ws.close(1001,'Host left');
   room.players.clear();
  }else if(room.players.get(client.peerId)===client){
   room.players.delete(client.peerId);
   send(room.host.ws,{type:'peer-left',peerId:client.peerId,campaignId:client.campaignId});
  }
 }
 async function message(client,raw,binary){
  if(client.left)return;
  let value;
  try{
   if(binary||raw.length>65536)throw Error('Invalid frame');
   value=JSON.parse(raw.toString());
   if(!value||typeof value!=='object'||Array.isArray(value)||
    value.type!=='signal'||!KINDS.has(value.kind)||
    !validPayload(value.kind,value.payload)||
    Object.keys(value).some(k=>!['type','kind','payload','targetPeerId'].includes(k))||
    (client.role==='host'&&(value.kind==='answer'||!UUID.test(value.targetPeerId??'')))||
    (client.role==='player'&&value.kind==='offer')||
    (client.role==='player'&&Object.hasOwn(value,'targetPeerId')))throw Error('Invalid signal');
  }catch{client.ws.close(1008,'Invalid frame');return;}
  let valid=false;
  try{valid=await current(client);}catch{}
  if(!valid){client.ws.close(1008,'Access revoked');leave(client);return;}
  const room=rooms.get(client.campaignId);
  if(!room||client.left)return;
  if(client.role==='player'){
   if(room.players.get(client.peerId)!==client)return;
   let gmValid=false;
   try{gmValid=await current(room.host);}catch{}
   if(!gmValid){room.host.ws.close(1008,'Host revoked');leave(room.host);return;}
   if(rooms.get(client.campaignId)!==room||room.players.get(client.peerId)!==client)return;
   send(room.host.ws,{type:'signal',kind:value.kind,peerId:client.peerId,payload:value.payload});
  }else{
   if(room.host!==client)return;
   const peer=room.players.get(value.targetPeerId);
   if(!peer)return;
   let memberValid=false;
   try{memberValid=await current(peer);}catch{}
   if(!memberValid){peer.ws.close(1008,'Access revoked');leave(peer);return;}
   if(rooms.get(client.campaignId)!==room||room.host!==client||
    room.players.get(peer.peerId)!==peer)return;
   send(peer.ws,{type:'signal',kind:value.kind,payload:value.payload});
  }
 }
 async function upgrade(req,socket,head){
  if(stopped)return deny(socket);
  let url;
  try{url=new URL(req.url,'https://hollowgate.invalid');}catch{return deny(socket);}
  if(url.pathname!=='/vtt/signaling'||req.headers.origin!==origin||
   [...url.searchParams.keys()].sort().join(',')!=='campaignId,role'||
   url.searchParams.getAll('campaignId').length!==1||
   url.searchParams.getAll('role').length!==1)return deny(socket);
  const campaignId=url.searchParams.get('campaignId'),role=url.searchParams.get('role');
  const token=cookie(req);
  if(!token||!UUID.test(campaignId)||!['host','player'].includes(role))return deny(socket,401);
  let proof;
  try{proof=await identity.verify({sessionToken:token,campaignId,connectionRole:role});}
  catch{return deny(socket);}
  if(stopped||socket.destroyed||proof?.campaignId!==campaignId||
   proof.role!==(role==='host'?'gm':'player')||!UUID.test(proof.userId))return deny(socket);
  if(role==='host'&&rooms.has(campaignId))return deny(socket);
  if(role==='player'&&!rooms.has(campaignId))return deny(socket);
  wss.handleUpgrade(req,socket,head,ws=>{
   const client={ws,token,userId:proof.userId,campaignId,role,
    peerId:randomUUID(),left:false};
   const room=rooms.get(campaignId);
   // Recheck inside the upgrade callback: two concurrent verified upgrades
   // must never replace the existing host and orphan its player sockets.
   if(role==='host'&&room){ws.close(1008,'Host already connected');return;}
   if(role==='host')rooms.set(campaignId,{host:client,players:new Map()});
   else if(room&&!room.host.left&&rooms.get(campaignId)===room)
    room.players.set(client.peerId,client);
   else{ws.close(1008,'Host unavailable');return;}
   clients.add(ws);sessions.add(client);
   ws.on('close',()=>leave(client));ws.on('error',()=>leave(client));
   let pending=Promise.resolve();
   ws.on('message',(raw,binary)=>{
    pending=pending.then(()=>message(client,raw,binary)).catch(()=>ws.close(1011,'Signal error'));
   });
   send(ws,{type:'ready',role,peerId:client.peerId});
   // This identity is sourced only from the server-side membership verifier,
   // never from a player-authored WebSocket or DataChannel envelope.
   if(role==='player'&&room&&!room.host.left&&rooms.get(campaignId)===room)
    send(room.host.ws,{type:'peer-joined',
    peerId:client.peerId,userId:client.userId,campaignId:client.campaignId});
  });
 }
 const listener=(req,socket,head)=>{
  try{
   if(new URL(req.url,'https://hollowgate.invalid').pathname==='/vtt/signaling')
    void upgrade(req,socket,head);
  }catch{}
 };
 server.on('upgrade',listener);
 // Recheck ongoing memberships even when WebRTC transports carry all data
 // and the signaling socket is idle. Closing a revoked socket also tears
 // down its browser peer through 'peer-left' or the host-room close.
 let checking=false;
 const interval=setInterval(async()=>{
  if(stopped||checking)return;
  checking=true;
  try{
   for(const client of [...sessions]){
    if(stopped||client.left)continue;
    let valid=false;
    try{valid=await current(client);}catch{}
    if(stopped||client.left||!sessions.has(client))continue;
    if(!valid){
     client.ws.close(1008,'Access revoked');
     leave(client);
    }
   }
  }finally{checking=false;}
 },revalidateIntervalMs);
 interval.unref?.();
 return {close(){
  clearInterval(interval);
  stopped=true;server.off('upgrade',listener);
  for(const ws of clients)ws.close(1001,'Gateway closed');
  clients.clear();rooms.clear();wss.close();
 }};
}
