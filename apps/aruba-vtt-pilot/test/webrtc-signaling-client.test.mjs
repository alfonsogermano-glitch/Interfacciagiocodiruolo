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
test('rejects malformed campaign IDs and unsupported roles',()=>{
 assert.throws(()=>createArubaWebRtcSignalingClient({campaignId:'invalid',role:'host',
  WebSocketCtor:Socket,PeerConnectionCtor:Peer,origin:'https://staging.hollowgate.quest'}));
});
