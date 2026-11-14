import test from 'node:test';
import assert from 'node:assert/strict';
import {createArubaWebRtcSignalingClient} from '../src/ArubaWebRtcSignalingClient.mjs';
const campaign='00000000-0000-4000-8000-000000000001';
const member='00000000-0000-4000-8000-000000000002';
class Socket{
 static instances=[];
 constructor(url){this.url=url;this.readyState=1;this.sent=[];Socket.instances.push(this);}
 send(value){this.sent.push(JSON.parse(value));}
 receive(message){this.onmessage({data:JSON.stringify(message)});}
 close(){this.readyState=3;}
}
class Peer{
 static instances=[];
 constructor(){this.remote=null;this.candidates=[];this.connectionState='new';Peer.instances.push(this);}
 createDataChannel(){return {onmessage:null,close(){}};}
 async createOffer(){return {type:'offer',sdp:'offer-sdp'};}
 async createAnswer(){return {type:'answer',sdp:'answer-sdp'};}
 async setLocalDescription(value){this.localDescription=value;}
 async setRemoteDescription(value){this.remote=value;}
 async addIceCandidate(value){this.candidates.push(value);}
 close(){this.connectionState='closed';}
}
const flush=()=>new Promise(resolve=>setImmediate(resolve));
function setup(role){
 const states=[];
 const client=createArubaWebRtcSignalingClient({campaignId:campaign,role,
  WebSocketCtor:Socket,PeerConnectionCtor:Peer,origin:'https://staging.hollowgate.quest',
  onState:value=>states.push(value)});
 const socket=client.connect();
 return {client,socket,states};
}
test('host negotiates offer using the server-issued peer ID without game data',async()=>{
 const {client,socket}=setup('host');
 assert.match(socket.url,/^wss:\/\/staging\.hollowgate\.quest\/vtt\/signaling\?/);
 socket.receive({type:'ready',role:'host',peerId:member});await flush();
 socket.receive({type:'peer-joined',peerId:member});await flush();
 assert.deepEqual(socket.sent,[{type:'signal',kind:'offer',payload:{sdp:'offer-sdp'},targetPeerId:member}]);
 assert.equal(client.peerCount,1);
 socket.receive({type:'peer-left',peerId:member});await flush();
 assert.equal(client.peerCount,0);
 client.disconnect();
});
test('player buffers early ICE and answers an offer without forwarding messages',async()=>{
 const {client,socket}=setup('player');
 socket.receive({type:'ready',role:'player',peerId:member});await flush();
 socket.receive({type:'signal',kind:'ice',payload:{candidate:{candidate:'ice'}}});await flush();
 socket.receive({type:'signal',kind:'offer',payload:{sdp:'remote-offer'}});await flush();
 assert.deepEqual(socket.sent,[{type:'signal',kind:'answer',payload:{sdp:'answer-sdp'}}]);
 assert.deepEqual(Peer.instances.at(-1).candidates,[{candidate:'ice'}]);
 client.disconnect();
});
test('not-ready clients reject unsolicited signals and disconnect closes peers',async()=>{
 const {client,socket}=setup('host');
 socket.receive({type:'peer-joined',peerId:member});await flush();
 assert.equal(client.peerCount,0);
 socket.receive({type:'ready',role:'host',peerId:member});await flush();
 socket.receive({type:'peer-joined',peerId:member});await flush();
 assert.equal(client.peerCount,1);
 client.disconnect();
 assert.equal(client.peerCount,0);
 assert.equal(client.connected,false);
});

test('manual reconnect after socket closure creates a fresh signaling generation',async()=>{
 const {client,socket,states}=setup('host');
 socket.receive({type:'ready',role:'host',peerId:member});await flush();
 socket.receive({type:'peer-joined',peerId:member});await flush();
 assert.equal(client.peerCount,1);
 socket.onclose();
 assert.equal(client.connected,false);
 assert.equal(client.peerCount,0);
 const again=client.connect();
 assert.notEqual(again,socket);
 again.receive({type:'ready',role:'host',peerId:member});await flush();
 again.receive({type:'peer-joined',peerId:member});await flush();
 assert.equal(client.peerCount,1);
 assert.equal(again.sent.filter(x=>x.kind==='offer').length,1);
 assert.ok(states.some(x=>x.state==='disconnected'));
 client.disconnect();
});

test('duplicate joins cannot replace an active peer or create duplicate offers',async()=>{
 const {client,socket}=setup('host');
 socket.receive({type:'ready',role:'host',peerId:member});await flush();
 socket.receive({type:'peer-joined',peerId:member});
 socket.receive({type:'peer-joined',peerId:member});
 await flush();
 assert.equal(client.peerCount,1);
 assert.equal(socket.sent.filter(x=>x.kind==='offer').length,1);
 client.disconnect();
});

test('late asynchronous offer from a closed socket cannot publish into a reconnected room',async()=>{
 let resolveOffer;
 class SlowPeer extends Peer{
  async createOffer(){return await new Promise(resolve=>{resolveOffer=resolve;});}
 }
 const client=createArubaWebRtcSignalingClient({campaignId:campaign,role:'host',
  WebSocketCtor:Socket,PeerConnectionCtor:SlowPeer,origin:'https://staging.hollowgate.quest'});
 const first=client.connect();
 first.receive({type:'ready',role:'host',peerId:member});await flush();
 first.receive({type:'peer-joined',peerId:member});await flush();
 assert.equal(typeof resolveOffer,'function');
 client.disconnect();
 const second=client.connect();
 second.receive({type:'ready',role:'host',peerId:member});
 resolveOffer({type:'offer',sdp:'late-old-offer'});
 await flush();await flush();
 assert.deepEqual(second.sent,[]);
 client.disconnect();
});

test('rejects malformed campaign IDs and unsupported roles',()=>{
 assert.throws(()=>createArubaWebRtcSignalingClient({campaignId:'invalid',role:'host',
  WebSocketCtor:Socket,PeerConnectionCtor:Peer,origin:'https://staging.hollowgate.quest'}));
});

test('pending ICE queue is bounded and a flooded peer is discarded',async()=>{
 const errors=[];
 const client=createArubaWebRtcSignalingClient({campaignId:campaign,role:'player',
  WebSocketCtor:Socket,PeerConnectionCtor:Peer,origin:'https://staging.hollowgate.quest',
  onError:error=>errors.push(error.message)});
 const socket=client.connect();
 socket.receive({type:'ready',role:'player',peerId:member});await flush();
 for(let n=0;n<129;n++){
  socket.receive({type:'signal',kind:'ice',payload:{candidate:{candidate:'ice-'+n}}});
 }
 await flush();
 assert.equal(client.peerCount,0);
 assert.deepEqual(errors,['Troppi candidati ICE in attesa']);
 client.disconnect();
});
test('disconnect during remote ICE flush prevents continuing stale candidates',async()=>{
 let release,applied=0;
 class DelayedIcePeer extends Peer{
  async addIceCandidate(value){
   applied++;
   if(applied===1)await new Promise(resolve=>{release=resolve;});
   return super.addIceCandidate(value);
  }
 }
 const client=createArubaWebRtcSignalingClient({campaignId:campaign,role:'player',
  WebSocketCtor:Socket,PeerConnectionCtor:DelayedIcePeer,
  origin:'https://staging.hollowgate.quest'});
 const socket=client.connect();
 socket.receive({type:'ready',role:'player',peerId:member});await flush();
 socket.receive({type:'signal',kind:'ice',payload:{candidate:{candidate:'first'}}});
 socket.receive({type:'signal',kind:'ice',payload:{candidate:{candidate:'second'}}});
 socket.receive({type:'signal',kind:'offer',payload:{sdp:'offer'}});await flush();
 assert.equal(applied,1);
 client.disconnect();
 release();await flush();
 assert.equal(applied,1);
 assert.equal(socket.sent.length,0);
});

test('ICE config accepts authenticated TURN and rejects unsafe or unbounded settings',()=>{
 const construct=config=>createArubaWebRtcSignalingClient({
  campaignId:campaign,role:'host',WebSocketCtor:Socket,PeerConnectionCtor:Peer,
  origin:'https://staging.hollowgate.quest',rtcConfig:config,
 });
 const valid=construct({iceTransportPolicy:'relay',iceServers:[{
  urls:['turn:relay.hollowgate.quest:3478?transport=udp','turns:relay.hollowgate.quest:5349?transport=tcp'],
  username:'temporary-user',credential:'temporary-secret',
 }]});
 assert.equal(valid.peerCount,0);
 for(const invalid of [
  {iceTransportPolicy:'relay',iceServers:[]},
  {iceServers:[{urls:'https://relay.hollowgate.quest'}]},
  {iceServers:[{urls:'turn:relay.hollowgate.quest:3478'}]},
  {iceServers:[{urls:'stun:stun.hollowgate.quest:3478',credential:'leak'}]},
  {iceServers:Array.from({length:9},()=>({urls:'stun:stun.hollowgate.quest:3478'}))},
  {iceTransportPolicy:'arbitrary'},
  {iceServers:[{urls:'turn:username:password@relay.example.com'}]},
 ])assert.throws(()=>construct(invalid));
});

test('ICE diagnostics expose only route and connection state, never credentials or IPs',async()=>{
 class StatsPeer extends Peer{
  async getStats(){
   return new Map([
    ['transport',{type:'transport',selectedCandidatePairId:'pair'}],
    ['pair',{type:'candidate-pair',state:'succeeded',nominated:true,
     localCandidateId:'local',remoteCandidateId:'remote'}],
    ['local',{candidateType:'relay',address:'192.0.2.2',usernameFragment:'secret'}],
    ['remote',{candidateType:'srflx',address:'198.51.100.10'}],
   ]);
  }
 }
 const config={iceServers:[{urls:'turn:relay.hollowgate.quest:3478',
  username:'temporary-user',credential:'temporary-secret'}]};
 const client=createArubaWebRtcSignalingClient({
  campaignId:campaign,role:'host',WebSocketCtor:Socket,PeerConnectionCtor:StatsPeer,
  origin:'https://staging.hollowgate.quest',rtcConfig:config,
 });
 const ws=client.connect();
 ws.receive({type:'ready',role:'host',peerId:member});await flush();
 ws.receive({type:'peer-joined',peerId:member});await flush();
 const result=await client.inspectConnections();
 assert.deepEqual(result,[{peerId:member,route:'relay',iceState:'unknown',connectionState:'new'}]);
 assert.doesNotMatch(JSON.stringify(result),/192\.0\.2|198\.51\.100|secret|temporary/);
 client.disconnect();
 assert.deepEqual(await client.inspectConnections(),[]);
});

test('authenticated TURN response supplies ICE settings before opening signaling',async()=>{
 const created=[];
 class ConfigPeer extends Peer{
  constructor(config){super();created.push(config);}
 }
 const client=createArubaWebRtcSignalingClient({
  campaignId:campaign,role:'host',WebSocketCtor:Socket,PeerConnectionCtor:ConfigPeer,
  origin:'https://staging.hollowgate.quest',now:()=>1000000,
 });
 const calls=[];
 const fetchImpl=async(url,options)=>{
  calls.push({url,options});
  return {ok:true,status:200,json:async()=>({
   expiresAt:1300,
   iceServers:[{urls:['turn:relay.example.org:3478?transport=udp'],
    username:'1300:verified-user',credential:'ephemeral-only'}],
  })};
 };
 const ws=await client.connectWithTurn(fetchImpl,{iceTransportPolicy:'relay'});
 assert.equal(calls.length,1);
 assert.equal(calls[0].url,'/vtt/ice-credentials');
 assert.equal(calls[0].options.credentials,'same-origin');
 assert.equal(calls[0].options.cache,'no-store');
 assert.deepEqual(JSON.parse(calls[0].options.body),{campaignId:campaign,role:'host'});
 ws.receive({type:'ready',role:'host',peerId:member});await flush();
 ws.receive({type:'peer-joined',peerId:member});await flush();
 assert.equal(created[0].iceTransportPolicy,'relay');
 assert.deepEqual(created[0].iceServers[0].urls,
  ['turn:relay.example.org:3478?transport=udp']);
 client.disconnect();
});
test('invalid, expired or unauthorized TURN response never opens a socket',async()=>{
 const invalid=[
  {status:401,ok:false},
  {status:404,ok:false},
  {ok:true,status:200,json:async()=>({expiresAt:1001,iceServers:[]})},
  {ok:true,status:200,json:async()=>({expiresAt:1300,iceServers:[]})},
  {ok:true,status:200,json:async()=>({expiresAt:1300,iceServers:[
   {urls:'turn:relay.example.org:3478',username:'user',credential:'token',extra:'secret'}]})},
 ];
 for(const response of invalid){
  const client=createArubaWebRtcSignalingClient({
   campaignId:campaign,role:'player',WebSocketCtor:Socket,PeerConnectionCtor:Peer,
   origin:'https://staging.hollowgate.quest',now:()=>1000000,
  });
  const count=Socket.instances.length;
  await assert.rejects(client.connectWithTurn(async()=>response,{iceTransportPolicy:'relay'}));
  assert.equal(Socket.instances.length,count);
  assert.equal(client.connected,false);
 }
});
test('TURN credential request in flight does not permit manual connection',async()=>{
 let release;
 const fetchImpl=()=>new Promise(resolve=>{release=resolve;});
 const client=createArubaWebRtcSignalingClient({
  campaignId:campaign,role:'host',WebSocketCtor:Socket,PeerConnectionCtor:Peer,
  origin:'https://staging.hollowgate.quest',now:()=>1000000,
 });
 const pending=client.connectWithTurn(fetchImpl,{iceTransportPolicy:'relay'});
 assert.throws(()=>client.connect());
 release({ok:false,status:503});
 await assert.rejects(pending);
 const ws=client.connect();
 assert.ok(ws);
 client.disconnect();
});

test('host records only server-verified peer metadata and revokes on leave',async()=>{
 const verified=[],revoked=[];
 const client=createArubaWebRtcSignalingClient({
  campaignId:campaign,role:'host',WebSocketCtor:Socket,PeerConnectionCtor:Peer,
  origin:'https://staging.hollowgate.quest',
  onVerifiedPeer:proof=>verified.push(proof),
  onPeerRevoked:proof=>revoked.push(proof),
 });
 const ws=client.connect();
 ws.receive({type:'ready',role:'host',peerId:member});await flush();
 const user='00000000-0000-4000-8000-000000000004';
 ws.receive({type:'peer-joined',peerId:member,userId:user,campaignId:campaign});
 await flush();
 assert.deepEqual(verified,[{peerId:member,userId:user,campaignId:campaign}]);
 assert.deepEqual(client.getVerifiedPeer(member),verified[0]);
 ws.receive({type:'peer-joined',peerId:member,userId:'00000000-0000-4000-8000-000000000009',campaignId:campaign});
 await flush();
 assert.equal(verified.length,1,'duplicate peer must never swap its identity');
 ws.receive({type:'peer-left',peerId:member});await flush();
 assert.deepEqual(revoked,verified);
 assert.equal(client.getVerifiedPeer(member),null);
 client.disconnect();
});
test('missing or mismatched server proof never makes a peer authorized',async()=>{
 const verified=[];
 const client=createArubaWebRtcSignalingClient({
  campaignId:campaign,role:'host',WebSocketCtor:Socket,PeerConnectionCtor:Peer,
  origin:'https://staging.hollowgate.quest',onVerifiedPeer:proof=>verified.push(proof),
 });
 const ws=client.connect();
 ws.receive({type:'ready',role:'host',peerId:member});await flush();
 ws.receive({type:'peer-joined',peerId:member,userId:member,
  campaignId:'00000000-0000-4000-8000-000000000099'});
 await flush();
 assert.equal(client.peerCount,1);
 assert.deepEqual(verified,[]);
 assert.equal(client.getVerifiedPeer(member),null);
 client.disconnect();
});
test('disconnect cancels previously verified peer metadata and emits revocation',async()=>{
 const revoked=[];
 const client=createArubaWebRtcSignalingClient({
  campaignId:campaign,role:'host',WebSocketCtor:Socket,PeerConnectionCtor:Peer,
  origin:'https://staging.hollowgate.quest',onPeerRevoked:proof=>revoked.push(proof),
 });
 const ws=client.connect();
 ws.receive({type:'ready',role:'host',peerId:member});await flush();
 ws.receive({type:'peer-joined',peerId:member,userId:member,campaignId:campaign});
 await flush();
 client.disconnect();
 assert.equal(client.getVerifiedPeer(member),null);
 assert.equal(revoked.length,1);
});
