import test from 'node:test';
import assert from 'node:assert/strict';
import {createCampaignSceneSession} from '../src/campaign-scene-session.mjs';
const campaignId='12345678-1234-4123-8123-123456789abc';
const sceneId='22345678-1234-4123-8123-123456789abc';
const tokenId='32345678-1234-4123-8123-123456789abc';
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
 async setLocalDescription(v){this.localDescription=v;}
 async setRemoteDescription(v){this.remoteDescription=v;}
 async addIceCandidate(){}
 close(){this.connectionState='closed';}
}
const tick=()=>new Promise(resolve=>setImmediate(resolve));
test('GM scene session publishes redacted token state through actual game channel',async()=>{
 const session=createCampaignSceneSession({origin:'https://staging.hollowgate.quest',campaignId,sceneId,role:'host',WebSocketImpl:Socket,PeerConnectionImpl:Peer});
 const token={id:tokenId,name:'Secret',x:1,y:2,size:1,visible:false};
 assert.equal(session.dispatch({type:'add',token}),true);
 Socket.last.message({type:'ready',role:'host',peerId:tokenId});
 Socket.last.message({type:'peer-joined',peerId:tokenId,campaignId});
 for(let i=0;i<30&&!Socket.last.sent.some(x=>x.kind==='offer');i++)await tick();
 assert.ok(Socket.last.sent.some(x=>x.kind==='offer'));
 Peer.last.channel.onopen();
 assert.deepEqual(Peer.last.channel.sent[0].payload.state.tokens,[]);
 assert.equal(session.dispatch({type:'visibility',tokenId,visible:true}),true);
 assert.equal(Peer.last.channel.sent[1].payload.state.tokens[0].id,tokenId);
 session.close();assert.equal(session.dispatch({type:'remove',tokenId}),false);
});
test('player scene session rejects local token mutations and accepts GM snapshots from its channel',async()=>{
 const scenes=[];const session=createCampaignSceneSession({origin:'https://staging.hollowgate.quest',campaignId,sceneId,role:'player',WebSocketImpl:Socket,PeerConnectionImpl:Peer,onScene:s=>scenes.push(s)});
 assert.equal(session.dispatch({type:'add',token:{}}),false);
 Socket.last.message({type:'ready',role:'player',peerId:tokenId});
 Socket.last.message({type:'signal',kind:'offer',payload:{sdp:'offer'}});
 for(let i=0;i<30&&!Socket.last.sent.some(x=>x.kind==='answer');i++)await tick();
 const channel=new Channel('hollowgate-game');Peer.last.ondatachannel({channel});channel.onopen();
 const state={sceneId,tokens:[{id:tokenId,name:'Explorer',x:3,y:4,size:1,visible:true}]};
 channel.onmessage({data:JSON.stringify({type:'game',campaignId,payload:{kind:'snapshot',campaignId,revision:1,state}})});
 assert.deepEqual(session.getScene(),state);assert.equal(scenes.length,1);
 session.close();assert.equal(session.getScene(),null);
});

test('player clears stale scene and accepts a fresh revision epoch after channel closes',async()=>{
 const scenes=[];
 const session=createCampaignSceneSession({origin:'https://staging.hollowgate.quest',campaignId,sceneId,role:'player',WebSocketImpl:Socket,PeerConnectionImpl:Peer,onScene:scene=>scenes.push(scene)});
 Socket.last.message({type:'ready',role:'player',peerId:tokenId});
 Socket.last.message({type:'signal',kind:'offer',payload:{sdp:'offer'}});
 for(let i=0;i<30&&!Socket.last.sent.some(x=>x.kind==='answer');i++)await tick();
 const channel=new Channel('hollowgate-game');Peer.last.ondatachannel({channel});channel.onopen();
 const first={sceneId,tokens:[{id:tokenId,name:'Old',x:1,y:1,size:1,visible:true}]};
 const next={sceneId,tokens:[{id:tokenId,name:'New',x:2,y:2,size:1,visible:true}]};
 const deliver=(revision,state)=>channel.onmessage({data:JSON.stringify({type:'game',campaignId,payload:{kind:'snapshot',campaignId,revision,state}})});
 deliver(45,first);
 assert.deepEqual(session.getScene(),first);
 channel.readyState='closed';channel.onclose();
 assert.equal(session.getScene(),null);
 assert.equal(scenes.at(-1),null);
 // A stale closed channel must not deliver snapshots after disconnection.
 deliver(1,next);assert.equal(session.getScene(),null);
 Socket.last.message({type:'signal',kind:'offer',payload:{sdp:'new-offer'}});
 for(let i=0;i<30&&Socket.last.sent.filter(x=>x.kind==='answer').length<2;i++)await tick();
 assert.equal(Socket.last.sent.filter(x=>x.kind==='answer').length,2);
 const newChannel=new Channel('hollowgate-game');Peer.last.ondatachannel({channel:newChannel});newChannel.onopen();
 newChannel.onmessage({data:JSON.stringify({type:'game',campaignId,payload:{kind:'snapshot',campaignId,revision:1,state:next}})});
 assert.deepEqual(session.getScene(),next);
 assert.deepEqual(scenes.at(-1),next);
 session.close();
});

test('closed scene session ignores late transport status and snapshots',async()=>{
 const statuses=[];const scenes=[];
 const session=createCampaignSceneSession({origin:'https://staging.hollowgate.quest',campaignId,sceneId,role:'player',WebSocketImpl:Socket,PeerConnectionImpl:Peer,onStatus:e=>statuses.push(e),onScene:s=>scenes.push(s)});
 const socket=Socket.last;
 session.close();
 const statusCount=statuses.length;
 const sceneCount=scenes.length;
 socket.message({type:'ready',role:'player',peerId:tokenId});
 for(const fn of socket.listeners.close??[])fn({});
 assert.equal(statuses.length,statusCount);
 assert.equal(scenes.length,sceneCount);
 assert.equal(session.getScene(),null);
});

test('scene session exposes original publication only through GM role and refuses closed sessions',()=>{
 const host=createCampaignSceneSession({origin:'https://staging.hollowgate.quest',campaignId,sceneId,role:'host',WebSocketImpl:Socket,PeerConnectionImpl:Peer});
 const publication={campaignId,sceneId,mapTokens:[{id:tokenId,name:'Scout',x:1,y:2,hiddenFromPlayers:true}]};
 assert.equal(host.loadOriginal(publication),true);
 assert.equal(host.getScene().tokens[0].name,'Scout');
 host.close();assert.equal(host.loadOriginal(publication),false);
 const player=createCampaignSceneSession({origin:'https://staging.hollowgate.quest',campaignId,sceneId,role:'player',WebSocketImpl:Socket,PeerConnectionImpl:Peer});
 assert.equal(player.loadOriginal(publication),false);
 player.close();
});

test('GM transport binds original publication to its authorized campaign, not caller input',()=>{
 const host=createCampaignSceneSession({origin:'https://staging.hollowgate.quest',campaignId,sceneId,role:'host',WebSocketImpl:Socket,PeerConnectionImpl:Peer});
 const other='42345678-1234-4123-8123-123456789abc';
 const publication={campaignId:other,sceneId,mapTokens:[]};
 assert.throws(()=>host.loadOriginal(publication,other),/unavailable/);
 assert.deepEqual(host.getScene().tokens,[]);
 host.close();
});
