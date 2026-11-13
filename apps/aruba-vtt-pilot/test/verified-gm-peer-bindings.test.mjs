import test from 'node:test';
import assert from 'node:assert/strict';
import {createGmHostEventRouter} from '../src/ArubaGmHostEventRouter.mjs';
import {createVerifiedGmPeerBindings} from '../src/ArubaVerifiedGmPeerBindings.mjs';

const campaign='00000000-0000-4000-8000-000000000001';
const gm='00000000-0000-4000-8000-000000000002';
const user='00000000-0000-4000-8000-000000000003';
const other='00000000-0000-4000-8000-000000000009';
const peerId='00000000-0000-4000-8000-000000000004';
const proof={peerId,userId:user,campaignId:campaign};

class Channel{
 constructor(){this.readyState='open';this.handlers=new Map();this.outbound=[];}
 addEventListener(k,fn){if(!this.handlers.has(k))this.handlers.set(k,new Set());this.handlers.get(k).add(fn);}
 removeEventListener(k,fn){this.handlers.get(k)?.delete(fn);}
 send(v){this.outbound.push(JSON.parse(v));}
 receive(value){for(const fn of [...(this.handlers.get('message')??[])])fn({data:JSON.stringify(value)});}
 close(){this.readyState='closed';for(const fn of [...(this.handlers.get('close')??[])])fn();}
}
const setup=()=>{
 const inbound=[];
 const router=createGmHostEventRouter({
  campaignId:campaign,gmUserId:gm,
  authorizePlayerEvent:({event,userId})=>event==='chat_message'&&userId===user,
  authorizeHostEvent:({toUserId,event})=>toUserId===user&&event==='active_scene_change',
 });
 const host=router.openVerifiedHost({authenticatedUserId:gm,
  receiveFromPlayer:frame=>inbound.push(frame)});
 const binding=createVerifiedGmPeerBindings({router,campaignId:campaign});
 return {router,host,binding,inbound};
};
test('verified session binds only after matching server proof and an open DataChannel',()=>{
 const {host,binding,inbound}=setup();
 const channel=new Channel();
 assert.equal(binding.attachChannel(peerId,channel),false);
 assert.equal(binding.onVerifiedPeer({...proof,campaignId:other}),false);
 assert.equal(binding.onVerifiedPeer(proof),true);
 assert.equal(binding.attachChannel(peerId,channel),true);
 assert.equal(host.connectedPlayers,1);
 channel.receive({event:'chat_message',payload:{text:'hello'}});
 assert.deepEqual(inbound,[{campaignId:campaign,fromUserId:user,event:'chat_message',payload:{text:'hello'}}]);
 host.publish('active_scene_change',{sceneId:'scene-1'});
 host.publish('notes_change',{secret:'hidden'});
 assert.deepEqual(channel.outbound,[{event:'active_scene_change',payload:{sceneId:'scene-1'}}]);
 binding.close();
});
test('revocation disconnects router, closes channel and rejects buffered messages',()=>{
 const {host,binding,inbound}=setup();
 const channel=new Channel();
 binding.onVerifiedPeer(proof);
 assert.equal(binding.attachChannel(peerId,channel),true);
 binding.onPeerRevoked(proof);
 assert.equal(binding.verifiedCount,0);
 assert.equal(binding.attachedCount,0);
 assert.equal(host.connectedPlayers,0);
 assert.equal(channel.readyState,'closed');
 channel.receive({event:'chat_message',payload:{text:'after revocation'}});
 host.publish('active_scene_change',{sceneId:'secret'});
 assert.deepEqual(inbound,[]);
 assert.deepEqual(channel.outbound,[]);
 assert.equal(binding.attachChannel(peerId,new Channel()),false);
 binding.close();
});
test('duplicate proof cannot swap verified identity, duplicate channel cannot replace it',()=>{
 const {binding,host}=setup();
 const first=new Channel(),second=new Channel();
 assert.equal(binding.onVerifiedPeer(proof),true);
 assert.equal(binding.onVerifiedPeer({...proof,userId:other}),false);
 assert.equal(binding.attachChannel(peerId,first),true);
 assert.equal(binding.attachChannel(peerId,second),false);
 binding.onPeerRevoked({...proof,userId:other});
 assert.equal(host.connectedPlayers,1);
 binding.onPeerRevoked(proof);
 assert.equal(host.connectedPlayers,0);
 binding.close();
});
test('same peer token cannot reuse previous channel after close and stale revocation',()=>{
 const {binding,host}=setup();
 binding.onVerifiedPeer(proof);
 const first=new Channel();
 binding.attachChannel(peerId,first);
 binding.onPeerRevoked(proof);
 binding.onVerifiedPeer({...proof,userId:other});
 const next=new Channel();
 assert.equal(binding.attachChannel(peerId,next),true);
 binding.onPeerRevoked(proof);
 assert.equal(host.connectedPlayers,1);
 binding.close();
 assert.equal(host.connectedPlayers,0);
 assert.equal(next.readyState,'closed');
});
test('GM shutdown disconnects all peers; no later proof can resurrect a channel',()=>{
 const {binding,host}=setup();
 const first=new Channel(),second=new Channel();
 binding.onVerifiedPeer(proof);
 binding.onVerifiedPeer({...proof,peerId:'00000000-0000-4000-8000-000000000005',userId:other});
 binding.attachChannel(peerId,first);
 binding.attachChannel('00000000-0000-4000-8000-000000000005',second);
 assert.equal(host.connectedPlayers,2);
 binding.close();binding.close();
 assert.equal(host.connectedPlayers,0);
 assert.equal(first.readyState,'closed');
 assert.equal(second.readyState,'closed');
 assert.equal(binding.onVerifiedPeer(proof),false);
 assert.equal(binding.attachChannel(peerId,new Channel()),false);
});
