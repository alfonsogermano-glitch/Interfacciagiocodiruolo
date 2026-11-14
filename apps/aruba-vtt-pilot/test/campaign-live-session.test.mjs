import test from 'node:test';
import assert from 'node:assert/strict';
import {createCampaignLiveSession} from '../src/campaign-live-session.mjs';
const campaignId='12345678-1234-4123-8123-123456789abc';
const peerId='22345678-1234-4123-8123-123456789abc';
class Socket{
 static OPEN=1;
 constructor(){this.readyState=1;this.listeners={};this.sent=[];Socket.last=this;}
 addEventListener(type,fn){(this.listeners[type]??=[]).push(fn);}
 message(data){for(const fn of this.listeners.message??[])fn({data:JSON.stringify(data)});}
 send(data){this.sent.push(JSON.parse(data));}
 close(){this.readyState=3;for(const fn of this.listeners.close??[])fn({});}
}
class Channel{
 constructor(label){this.label=label;this.readyState='open';this.sent=[];}
 send(data){this.sent.push(JSON.parse(data));}
 close(){this.readyState='closed';}
}
class Peer{
 constructor(){this.remoteDescription=null;this.connectionState='new';Peer.last=this;}
 createDataChannel(label){return this.channel=new Channel(label);}
 async createOffer(){return {type:'offer',sdp:'offer'};}
 async createAnswer(){return {type:'answer',sdp:'answer'};}
 async setLocalDescription(value){this.localDescription=value;}
 async setRemoteDescription(value){this.remoteDescription=value;}
 async addIceCandidate(){}
 close(){this.connectionState='closed';}
}
const tick=()=>new Promise(resolve=>setImmediate(resolve));
async function waitForOffer(){for(let i=0;i<30;i++){if(Socket.last.sent.some(x=>x.kind==='offer'))return;await tick();}assert.fail('Offer missing');}
test('GM live session broadcasts snapshots over its authenticated game channel and closes safely',async()=>{
 const received=[];const live=createCampaignLiveSession({origin:'https://staging.hollowgate.quest/',campaignId,role:'host',WebSocketImpl:Socket,PeerConnectionImpl:Peer,onSnapshot:x=>received.push(x)});
 assert.equal(live.publish({tokens:[]}),true);
 assert.equal(live.getSnapshot().revision,1);
 Socket.last.message({type:'ready',role:'host',peerId});
 Socket.last.message({type:'peer-joined',peerId,campaignId});await waitForOffer();
 Peer.last.channel.onopen();
 assert.equal(Peer.last.channel.sent[0].kind,'snapshot');
 assert.equal(Peer.last.channel.sent[0].state.tokens.length,0);
 assert.equal(live.publish({tokens:[{id:'one',x:3}]}),true);
 assert.equal(Peer.last.channel.sent[1].revision,2);
 assert.equal(received.length,2);
 live.close();assert.equal(live.publish({tokens:[]}),false);assert.equal(live.getSnapshot(),null);
});
test('player requests snapshot when channel opens and accepts GM revision',async()=>{
 const received=[];const live=createCampaignLiveSession({origin:'https://staging.hollowgate.quest/',campaignId,role:'player',WebSocketImpl:Socket,PeerConnectionImpl:Peer,onSnapshot:x=>received.push(x)});
 Socket.last.message({type:'ready',role:'player',peerId});
 Socket.last.message({type:'signal',kind:'offer',payload:{sdp:'offer'}});
 for(let i=0;i<30&&!Socket.last.sent.some(x=>x.kind==='answer');i++)await tick();
 assert.equal(Socket.last.sent[0]?.kind,'answer');
 const channel=new Channel('hollowgate-game');Peer.last.ondatachannel({channel});channel.onopen();
 assert.equal(channel.sent[0].kind,'request-snapshot');
 channel.onmessage({data:JSON.stringify({type:'game',campaignId,payload:{kind:'snapshot',campaignId,revision:1,state:{scene:'forest'}}})});
 assert.equal(received[0].state.scene,'forest');
 assert.equal(live.publish({scene:'forged'}),false);
 live.close();
});
