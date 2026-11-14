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
async function waitForSignal(kind){
 for(let i=0;i<30;i++){
  if(Socket.last.sent.some(x=>x.kind===kind))return;
  await tick();
 }
 assert.fail('WebRTC '+kind+' not emitted; events='+JSON.stringify(Socket.last.sent));
}
test('GM creates offer only after authenticated peer joins, then drops on departure',async()=>{
 const statuses=[];const session=createWebRtcSession({origin:'https://staging.hollowgate.quest/',campaignId,role:'host',WebSocketImpl:Socket,PeerConnectionImpl:Peer,onStatus:x=>statuses.push(x)});
 assert.equal(session.send({hello:1}),false);
 Socket.last.message({type:'ready',role:'host',peerId});
 Socket.last.message({type:'peer-joined',peerId,campaignId});await waitForSignal('offer');
 assert.equal(Socket.last.sent[0].kind,'offer');assert.equal(Socket.last.sent[0].targetPeerId,peerId);
 assert.equal(session.send({hello:1},peerId),true);
 assert.deepEqual(Peer.last.channel.sent[0],{type:'game',campaignId,payload:{hello:1}});
 Socket.last.message({type:'peer-left',peerId,campaignId:'other-campaign'});await tick();
 assert.equal(session.send({hello:'still-connected'},peerId),true);
 Socket.last.message({type:'peer-left',peerId,campaignId});await tick();
 assert.equal(session.send({hello:2},peerId),false);session.close();
});
test('player answers GM offer and ignores cross-campaign game data',async()=>{
 const data=[];const session=createWebRtcSession({origin:'https://staging.hollowgate.quest/',campaignId,role:'player',WebSocketImpl:Socket,PeerConnectionImpl:Peer,onData:x=>data.push(x)});
 Socket.last.message({type:'ready',role:'player',peerId});
 Socket.last.message({type:'signal',kind:'offer',payload:{sdp:'gm-offer'}});await waitForSignal('answer');
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
 Socket.last.message({type:'peer-joined',peerId,campaignId});await waitForSignal('offer');
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

test('player discards pre-offer ICE while negotiating a valid offer',async()=>{
 class DelayedPeer extends Peer{
  async setRemoteDescription(x){await new Promise(resolve=>setImmediate(resolve));this.remoteDescription=x;}
 }
 const statuses=[];
 const session=createWebRtcSession({origin:'https://staging.hollowgate.quest/',campaignId,role:'player',WebSocketImpl:Socket,PeerConnectionImpl:DelayedPeer,onStatus:x=>statuses.push(x)});
 Socket.last.message({type:'ready',role:'player',peerId});
 Socket.last.message({type:'signal',kind:'ice',payload:{candidate:{candidate:'candidate:1'}}});
 Socket.last.message({type:'signal',kind:'offer',payload:{sdp:'gm-offer'}});
 await waitForSignal('answer');
 assert.equal(Socket.last.sent[0]?.kind,'answer');
 assert.equal(Peer.last.ice?.length??0,0);
 session.close();
});
test('game channel send failure disconnects only failing peer without throwing',async()=>{
 const session=createWebRtcSession({origin:'https://staging.hollowgate.quest/',campaignId,role:'host',WebSocketImpl:Socket,PeerConnectionImpl:Peer});
 Socket.last.message({type:'ready',role:'host',peerId});
 Socket.last.message({type:'peer-joined',peerId,campaignId});await waitForSignal('offer');
 Peer.last.channel.send=()=>{throw new Error('channel closed mid-send');};
 assert.equal(session.send({scene:1},peerId),false);
 assert.equal(session.send({scene:2},peerId),false);
 session.close();
});

test('valid RFC 4122 peer identity negotiates an offer rather than silently discarding peer-joined',async()=>{
 const session=createWebRtcSession({origin:'https://staging.hollowgate.quest/',campaignId,role:'host',WebSocketImpl:Socket,PeerConnectionImpl:Peer});
 Socket.last.message({type:'ready',role:'host',peerId});
 Socket.last.message({type:'peer-joined',peerId,campaignId});
 await waitForSignal('offer');
 assert.equal(Socket.last.sent[0].targetPeerId,peerId);
 session.close();
});

test('host ignores unsolicited answers and ICE from peers not announced by server',async()=>{
 const session=createWebRtcSession({origin:'https://staging.hollowgate.quest/',campaignId,role:'host',WebSocketImpl:Socket,PeerConnectionImpl:Peer});
 Socket.last.message({type:'ready',role:'host',peerId});
 Socket.last.message({type:'signal',kind:'answer',peerId,payload:{sdp:'unannounced'}});
 Socket.last.message({type:'signal',kind:'ice',peerId,payload:{candidate:{candidate:'fake'}}});
 await tick();await tick();
 assert.equal(session.send({scene:1},peerId),false);
 assert.equal(Socket.last.sent.length,0);
 session.close();
});

test('player ignores unsolicited ICE without allocating a peer connection',async()=>{
 let allocations=0;
 class CountedPeer extends Peer{constructor(...args){super(...args);allocations++;}}
 const session=createWebRtcSession({origin:'https://staging.hollowgate.quest/',campaignId,role:'player',WebSocketImpl:Socket,PeerConnectionImpl:CountedPeer});
 Socket.last.message({type:'ready',role:'player',peerId});
 Socket.last.message({type:'signal',kind:'ice',payload:{candidate:{candidate:'unsolicited'}}});
 await tick();await tick();
 assert.equal(allocations,0);
 Socket.last.message({type:'signal',kind:'offer',payload:{sdp:'gm-offer'}});
 await waitForSignal('answer');
 assert.equal(allocations,1);
 session.close();
});

test('duplicate GM peer-joined events do not produce overlapping offers',async()=>{
 let offers=0;
 class CountedPeer extends Peer{async createOffer(){offers++;return super.createOffer();}}
 const session=createWebRtcSession({origin:'https://staging.hollowgate.quest/',campaignId,role:'host',WebSocketImpl:Socket,PeerConnectionImpl:CountedPeer});
 Socket.last.message({type:'ready',role:'host',peerId});
 Socket.last.message({type:'peer-joined',peerId,campaignId});
 Socket.last.message({type:'peer-joined',peerId,campaignId});
 await waitForSignal('offer');await tick();await tick();
 assert.equal(offers,1);
 assert.equal(Socket.last.sent.filter(x=>x.kind==='offer').length,1);
 session.close();
});

test('player ignores duplicate offers until the previous peer disconnects',async()=>{
 let allocations=0;
 class CountedPeer extends Peer{constructor(...args){super(...args);allocations++;}}
 const session=createWebRtcSession({origin:'https://staging.hollowgate.quest/',campaignId,role:'player',WebSocketImpl:Socket,PeerConnectionImpl:CountedPeer});
 Socket.last.message({type:'ready',role:'player',peerId});
 Socket.last.message({type:'signal',kind:'offer',payload:{sdp:'first'}});
 Socket.last.message({type:'signal',kind:'offer',payload:{sdp:'duplicate'}});
 await waitForSignal('answer');await tick();await tick();
 assert.equal(allocations,1);
 assert.equal(Socket.last.sent.filter(x=>x.kind==='answer').length,1);
 Peer.last.connectionState='disconnected';Peer.last.onconnectionstatechange();
 Socket.last.message({type:'signal',kind:'offer',payload:{sdp:'reconnected'}});
 for(let i=0;i<30&&Socket.last.sent.filter(x=>x.kind==='answer').length<2;i++)await tick();
 assert.equal(allocations,2);
 assert.equal(Socket.last.sent.filter(x=>x.kind==='answer').length,2);
 session.close();
});

test('stale replaced player channel cannot deliver data or disconnect the active channel',async()=>{
 const received=[];const statuses=[];
 const session=createWebRtcSession({origin:'https://staging.hollowgate.quest/',campaignId,role:'player',WebSocketImpl:Socket,PeerConnectionImpl:Peer,onData:x=>received.push(x),onStatus:x=>statuses.push(x)});
 Socket.last.message({type:'ready',role:'player',peerId});
 Socket.last.message({type:'signal',kind:'offer',payload:{sdp:'gm-offer'}});
 await waitForSignal('answer');
 const oldChannel=new Channel('hollowgate-game');Peer.last.ondatachannel({channel:oldChannel});oldChannel.onopen();
 const newChannel=new Channel('hollowgate-game');Peer.last.ondatachannel({channel:newChannel});newChannel.onopen();
 const packet={data:JSON.stringify({type:'game',campaignId,payload:{scene:'active'}})};
 oldChannel.onmessage(packet);
 oldChannel.onclose();
 assert.equal(received.length,0);
 assert.equal(statuses.some(x=>x.state==='channel-closed'),false);
 newChannel.onmessage(packet);
 assert.equal(received.length,1);
 assert.equal(session.send({ping:true}),true);
 assert.equal(newChannel.sent.length,1);
 session.close();
});

test('replacement data channel closes the superseded channel without disconnecting its peer',async()=>{
 const events=[];
 const session=createWebRtcSession({origin:'https://staging.hollowgate.quest/',campaignId,role:'player',WebSocketImpl:Socket,PeerConnectionImpl:Peer,onStatus:e=>events.push(e)});
 Socket.last.message({type:'ready',role:'player',peerId});
 Socket.last.message({type:'signal',kind:'offer',payload:{sdp:'offer'}});
 await waitForSignal('answer');
 const oldChannel=new Channel('hollowgate-game');
 Peer.last.ondatachannel({channel:oldChannel});
 const replacement=new Channel('hollowgate-game');
 Peer.last.ondatachannel({channel:replacement});
 assert.equal(oldChannel.readyState,'closed');
 assert.equal(replacement.readyState,'open');
 oldChannel.onclose();
 assert.equal(events.some(e=>e.state==='disconnected'),false);
 assert.equal(session.send({hello:'new'}),true);
 assert.equal(replacement.sent.length,1);
 session.close();
});

test('late connection-state event from a retired peer cannot disconnect its replacement',async()=>{
 const session=createWebRtcSession({origin:'https://staging.hollowgate.quest/',campaignId,role:'host',WebSocketImpl:Socket,PeerConnectionImpl:Peer});
 Socket.last.message({type:'ready',role:'host',peerId});
 Socket.last.message({type:'peer-joined',peerId,campaignId});
 await waitForSignal('offer');
 const retired=Peer.last;
 Socket.last.message({type:'peer-left',peerId,campaignId});
 await tick();
 Socket.last.message({type:'peer-joined',peerId,campaignId});
 for(let i=0;i<30&&Socket.last.sent.filter(x=>x.kind==='offer').length<2;i++)await tick();
 assert.equal(Socket.last.sent.filter(x=>x.kind==='offer').length,2);
 const active=Peer.last;
 assert.notEqual(active,retired);
 retired.connectionState='disconnected';retired.onconnectionstatechange();
 assert.equal(session.send({scene:'replacement'},peerId),true);
 assert.equal(active.channel.sent.length,1);
 session.close();
});

test('ICE candidate serialization failure disconnects only the affected peer without uncaught callback error',async()=>{
 const statuses=[];
 const session=createWebRtcSession({origin:'https://staging.hollowgate.quest/',campaignId,role:'host',WebSocketImpl:Socket,PeerConnectionImpl:Peer,onStatus:e=>statuses.push(e)});
 Socket.last.message({type:'ready',role:'host',peerId});
 Socket.last.message({type:'peer-joined',peerId,campaignId});
 await waitForSignal('offer');
 const peer=Peer.last;
 assert.doesNotThrow(()=>peer.onicecandidate({candidate:{toJSON(){throw new Error('invalid ICE candidate');}}}));
 assert.equal(statuses.some(e=>e.state==='negotiation-failed'),true);
 assert.equal(session.send({scene:1},peerId),false);
 session.close();
});

test('queued peer-joined cannot create a new connection after signaling disconnects',async()=>{
 let allocations=0;
 class CountedPeer extends Peer{constructor(...args){super(...args);allocations++;}}
 const session=createWebRtcSession({origin:'https://staging.hollowgate.quest/',campaignId,role:'host',WebSocketImpl:Socket,PeerConnectionImpl:CountedPeer});
 Socket.last.message({type:'ready',role:'host',peerId});
 Socket.last.message({type:'peer-joined',peerId,campaignId});
 Socket.last.close();
 await tick();await tick();
 assert.equal(allocations,0);
 assert.equal(Socket.last.sent.filter(x=>x.kind==='offer').length,0);
 assert.equal(session.send({scene:1},peerId),false);
 session.close();
});

test('failed GM offer signaling drops peer rather than leaving a stalled connection',async()=>{
 class FailingOfferSocket extends Socket{send(data){if(JSON.parse(data).kind==='offer')throw new Error('send failure');super.send(data);}}
 const statuses=[];
 const session=createWebRtcSession({origin:'https://staging.hollowgate.quest/',campaignId,role:'host',WebSocketImpl:FailingOfferSocket,PeerConnectionImpl:Peer,onStatus:e=>statuses.push(e)});
 Socket.last.message({type:'ready',role:'host',peerId});
 Socket.last.message({type:'peer-joined',peerId,campaignId});
 await tick();await tick();
 assert.equal(statuses.some(e=>e.state==='negotiation-failed'),true);
 assert.equal(session.send({scene:1},peerId),false);
 assert.equal(Peer.last.connectionState,'closed');
 session.close();
});

test('failed player answer signaling drops peer rather than leaving a stalled connection',async()=>{
 class FailingAnswerSocket extends Socket{send(data){if(JSON.parse(data).kind==='answer')throw new Error('send failure');super.send(data);}}
 const statuses=[];
 const session=createWebRtcSession({origin:'https://staging.hollowgate.quest/',campaignId,role:'player',WebSocketImpl:FailingAnswerSocket,PeerConnectionImpl:Peer,onStatus:e=>statuses.push(e)});
 Socket.last.message({type:'ready',role:'player',peerId});
 Socket.last.message({type:'signal',kind:'offer',payload:{sdp:'offer-sdp'},campaignId});
 await tick();await tick();
 assert.equal(statuses.some(e=>e.state==='negotiation-failed'),true);
 assert.equal(session.send({scene:1}),false);
 assert.equal(Peer.last.connectionState,'closed');
 session.close();
});

test('late data channel from retired player peer is closed without replacing active connection',async()=>{
 const session=createWebRtcSession({origin:'https://staging.hollowgate.quest/',campaignId,role:'player',WebSocketImpl:Socket,PeerConnectionImpl:Peer});
 Socket.last.message({type:'ready',role:'player',peerId});
 Socket.last.message({type:'signal',kind:'offer',payload:{sdp:'first'}});
 await waitForSignal('answer');
 const retired=Peer.last;
 retired.connectionState='disconnected';retired.onconnectionstatechange();
 Socket.last.message({type:'signal',kind:'offer',payload:{sdp:'second'}});
 for(let i=0;i<30&&Socket.last.sent.filter(x=>x.kind==='answer').length<2;i++)await tick();
 assert.notEqual(Peer.last,retired);
 const late=new Channel('hollowgate-game');
 retired.ondatachannel({channel:late});
 assert.equal(late.readyState,'closed');
 const active=new Channel('hollowgate-game');
 Peer.last.ondatachannel({channel:active});
 assert.equal(session.send({scene:'current'}),true);
 assert.equal(active.sent.length,1);
 session.close();
});

test('late asynchronous negotiation rejection after signaling disconnect does not emit spurious failure',async()=>{
 let rejectOffer;
 class DeferredFailingPeer extends Peer{createOffer(){return new Promise((resolve,reject)=>{rejectOffer=reject;});}}
 const statuses=[];
 const session=createWebRtcSession({origin:'https://staging.hollowgate.quest/',campaignId,role:'host',WebSocketImpl:Socket,PeerConnectionImpl:DeferredFailingPeer,onStatus:e=>statuses.push(e)});
 Socket.last.message({type:'ready',role:'host',peerId});
 Socket.last.message({type:'peer-joined',peerId,campaignId});
 await tick();
 assert.equal(typeof rejectOffer,'function');
 Socket.last.close();
 rejectOffer(new Error('negotiation rejected after socket closed'));
 await tick();await tick();
 assert.equal(statuses.some(e=>e.state==='signaling-disconnected'),true);
 assert.equal(statuses.some(e=>e.state==='negotiation-failed'),false);
 assert.equal(session.send({scene:1},peerId),false);
 session.close();
});
