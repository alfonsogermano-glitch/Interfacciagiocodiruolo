import test from 'node:test';
import assert from 'node:assert/strict';
import {createWebRtcSession} from '../src/webrtc-session.mjs';
const campaignId='12345678-1234-4123-8123-123456789abc';
const peerId='22345678-1234-4123-8123-123456789abc';
class Socket{
 static OPEN=1;
 constructor(){this.readyState=1;this.handlers={};this.sent=[];Socket.last=this;}
 addEventListener(k,f){(this.handlers[k]??=[]).push(f);}
 emit(k,data){for(const f of this.handlers[k]??[])f(data);}
 message(data){this.emit('message',{data:JSON.stringify(data)});}
 send(data){this.sent.push(JSON.parse(data));}
 close(){this.readyState=3;this.emit('close',{});}
}
class Channel{
 constructor(label){this.label=label;this.readyState='open';this.sent=[];}
 send(x){this.sent.push(JSON.parse(x));}
 close(){this.readyState='closed';}
}
class Peer{
 constructor(){this.remoteDescription=null;this.channel=null;this.connectionState='new';Peer.last=this;}
 createDataChannel(label){return this.channel=new Channel(label);}
 async createOffer(){return {type:'offer',sdp:'offer-sdp'};}
 async createAnswer(){return {type:'answer',sdp:'answer-sdp'};}
 async setLocalDescription(x){this.localDescription=x;}
 async setRemoteDescription(x){this.remoteDescription=x;}
 async addIceCandidate(x){(this.ice??=[]).push(x);}
 close(){this.connectionState='closed';}
}
const tick=()=>new Promise(resolve=>setImmediate(resolve));
test('GM creates offer only after authenticated peer joins, then drops on departure',async()=>{
 const statuses=[];const session=createWebRtcSession({origin:'https://staging.hollowgate.quest/',campaignId,role:'host',WebSocketImpl:Socket,PeerConnectionImpl:Peer,onStatus:x=>statuses.push(x)});
 assert.equal(session.send({hello:1}),false);
 Socket.last.message({type:'ready',role:'host',peerId});
 Socket.last.message({type:'peer-joined',peerId,campaignId});await tick();
 assert.equal(Socket.last.sent[0].kind,'offer');assert.equal(Socket.last.sent[0].targetPeerId,peerId);
 assert.equal(session.send({hello:1},peerId),true);
 assert.deepEqual(Peer.last.channel.sent[0],{type:'game',campaignId,payload:{hello:1}});
 Socket.last.message({type:'peer-left',peerId});await tick();
 assert.equal(session.send({hello:2},peerId),false);session.close();
});
test('player answers GM offer and ignores cross-campaign game data',async()=>{
 const data=[];const session=createWebRtcSession({origin:'https://staging.hollowgate.quest/',campaignId,role:'player',WebSocketImpl:Socket,PeerConnectionImpl:Peer,onData:x=>data.push(x)});
 Socket.last.message({type:'ready',role:'player',peerId});
 Socket.last.message({type:'signal',kind:'offer',payload:{sdp:'gm-offer'}});await tick();
 assert.equal(Socket.last.sent[0].kind,'answer');
 const channel=new Channel('hollowgate-game');Peer.last.ondatachannel({channel});
 channel.onmessage({data:JSON.stringify({type:'game',campaignId:'other',payload:'secret'})});
 channel.onmessage({data:JSON.stringify({type:'game',campaignId,payload:{scene:1}})});
 assert.deepEqual(data,[{peerId:campaignId,payload:{scene:1}}]);
 session.close();assert.equal(session.send({scene:2}),false);
});

test('GM rejects malformed target and unserializable or oversized game messages',async()=>{
 const session=createWebRtcSession({origin:'https://staging.hollowgate.quest/',campaignId,role:'host',WebSocketImpl:Socket,PeerConnectionImpl:Peer});
 Socket.last.message({type:'ready',role:'host',peerId});
 Socket.last.message({type:'peer-joined',peerId,campaignId});await tick();
 assert.equal(session.send({hello:1},'invalid'),false);
 const circular={};circular.self=circular;
 assert.equal(session.send(circular),false);
 assert.equal(session.send({text:'x'.repeat(66000)}),false);
 assert.equal(Peer.last.channel.sent.length,0);session.close();
});
test('closed session never sends an offer after delayed asynchronous negotiation',async()=>{
 class SlowPeer extends Peer{async createOffer(){await new Promise(resolve=>setImmediate(resolve));return super.createOffer();}}
 const session=createWebRtcSession({origin:'https://staging.hollowgate.quest/',campaignId,role:'host',WebSocketImpl:Socket,PeerConnectionImpl:SlowPeer});
 Socket.last.message({type:'ready',role:'host',peerId});Socket.last.message({type:'peer-joined',peerId,campaignId});
 session.close();await tick();await tick();
 assert.equal(Socket.last.sent.length,0);
});

test('player serializes ICE and offer processing and drops failed negotiation',async()=>{
 class DelayedPeer extends Peer{
  async setRemoteDescription(x){await new Promise(resolve=>setImmediate(resolve));this.remoteDescription=x;}
 }
 const statuses=[];
 const session=createWebRtcSession({origin:'https://staging.hollowgate.quest/',campaignId,role:'player',WebSocketImpl:Socket,PeerConnectionImpl:DelayedPeer,onStatus:x=>statuses.push(x)});
 Socket.last.message({type:'ready',role:'player',peerId});
 Socket.last.message({type:'signal',kind:'ice',payload:{candidate:{candidate:'candidate:1'}}});
 Socket.last.message({type:'signal',kind:'offer',payload:{sdp:'gm-offer'}});
 await tick();await tick();await tick();
 assert.equal(Socket.last.sent[0]?.kind,'answer');
 assert.equal(Peer.last.ice?.length,1);
 session.close();
});
test('game channel send failure disconnects only failing peer without throwing',async()=>{
 const session=createWebRtcSession({origin:'https://staging.hollowgate.quest/',campaignId,role:'host',WebSocketImpl:Socket,PeerConnectionImpl:Peer});
 Socket.last.message({type:'ready',role:'host',peerId});
 Socket.last.message({type:'peer-joined',peerId,campaignId});await tick();
 Peer.last.channel.send=()=>{throw new Error('channel closed mid-send');};
 assert.equal(session.send({scene:1},peerId),false);
 assert.equal(session.send({scene:2},peerId),false);
 session.close();
});
