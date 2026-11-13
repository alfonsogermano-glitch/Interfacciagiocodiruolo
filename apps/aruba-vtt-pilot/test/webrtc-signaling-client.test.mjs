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
