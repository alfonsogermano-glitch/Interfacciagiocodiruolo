import test from 'node:test';
import assert from 'node:assert/strict';
import {createArubaVerifiedRevisionConfirmation} from '../src/ArubaVerifiedRevisionConfirmation.mjs';
import {createArubaRevisionedPlayerReceiver} from '../src/ArubaRevisionedPlayerReceiver.mjs';
import {createArubaGmRevisionedCampaignSource} from '../src/ArubaGmRevisionedCampaignSource.mjs';

const campaign='00000000-0000-4000-8000-000000000001';
const gm='00000000-0000-4000-8000-000000000002';
const player='00000000-0000-4000-8000-000000000003';
const peer='00000000-0000-4000-8000-000000000004';
const otherPeer='00000000-0000-4000-8000-000000000005';
const req1='00000000-0000-4000-8000-000000000006';
const req2='00000000-0000-4000-8000-000000000007';
class Channel{
 constructor(){this.readyState='open';this.listeners=new Map();}
 addEventListener(type,fn){if(!this.listeners.has(type))this.listeners.set(type,new Set());this.listeners.get(type).add(fn);}
 removeEventListener(type,fn){this.listeners.get(type)?.delete(fn);}
 send(data){for(const fn of [...(this.listeners.get('message')??[])])fn({data});}
 close(){if(this.readyState==='closed')return;this.readyState='closed';
  for(const fn of [...(this.listeners.get('close')??[])])fn();}
}
function setup(){
 const members=new Set([player]),sent=[];
 let revision=0;
 const ack=createArubaVerifiedRevisionConfirmation({
  campaignId:campaign,gmUserId:gm,
  isVerifiedMember:({userId})=>members.has(userId),
  getPublishedRevision:()=>revision,
  sendVerifiedResult:x=>sent.push(x),
 });
 return {ack,members,sent,setRevision:n=>{revision=n;}};
}
const expected=(requestId,revision,peerId=peer)=>({userId:player,peerId,requestId,revision});
const observation=(revision,peerId=peer)=>({authenticatedUserId:player,verifiedCampaignId:campaign,peerId,revision});
test('no confirmation before authoritative publication or before receiver acknowledgment',()=>{
 const x=setup();
 assert.equal(x.ack.expect(expected(req1,1)),true);
 assert.equal(x.ack.acknowledge(observation(1)),false);
 assert.deepEqual(x.sent,[]);
 x.setRevision(1);
 assert.equal(x.ack.acknowledge(observation(1)),true);
 assert.deepEqual(x.sent,[{campaignId:campaign,toUserId:player,result:{
  type:'map-command-result',requestId:req1,outcome:'received-revision',revision:1,
 }}]);
 assert.equal(x.ack.acknowledge(observation(1)),false);
 x.ack.close();
});
test('cumulative player acknowledgment covers consecutive commands once each',()=>{
 const x=setup();
 x.setRevision(3);
 assert.equal(x.ack.expect(expected(req1,1)),true);
 assert.equal(x.ack.expect(expected(req2,3)),true);
 assert.equal(x.ack.acknowledge(observation(2)),true);
 assert.equal(x.sent.length,1);
 assert.equal(x.ack.acknowledge(observation(3)),true);
 assert.deepEqual(x.sent.map(m=>m.result.revision),[1,3]);
 assert.equal(x.ack.pendingCount,0);
 x.ack.close();
});
test('wrong peer, revoked membership or forged campaign cannot confirm a revision',()=>{
 const x=setup();
 x.setRevision(3);x.ack.expect(expected(req1,2));
 assert.equal(x.ack.acknowledge(observation(2,otherPeer)),false);
 assert.equal(x.ack.acknowledge({...observation(2),verifiedCampaignId:otherPeer}),false);
 assert.equal(x.ack.acknowledge({...observation(2),authenticatedUserId:gm}),false);
 x.members.delete(player);
 assert.equal(x.ack.acknowledge(observation(2)),false);
 assert.equal(x.sent.length,0);
 x.ack.revoke({userId:player,peerId:peer});
 assert.equal(x.ack.pendingCount,0);
 x.ack.close();
});
test('reconnect cannot reuse pending confirmation from stale peer',()=>{
 const x=setup();
 x.setRevision(4);
 x.ack.expect(expected(req1,3,peer));
 x.ack.revoke({userId:player,peerId:peer});
 assert.equal(x.ack.acknowledge(observation(4,otherPeer)),false);
 x.ack.expect(expected(req2,1,otherPeer));
 assert.equal(x.ack.acknowledge(observation(1,otherPeer)),true);
 assert.deepEqual(x.sent.map(m=>m.result.requestId),[req2]);
 x.ack.close();
});
test('missing GM source revision and invalid identifiers fail closed',()=>{
 const x=setup();
 assert.equal(x.ack.expect(expected('invalid',1)),false);
 assert.equal(x.ack.expect(expected(req1,-1)),false);
 assert.equal(x.ack.expect(expected(req1,1)),true);
 assert.equal(x.ack.expect(expected(req1,2)),false);
 assert.equal(x.ack.acknowledge(observation(100)),false);
 assert.deepEqual(x.sent,[]);
 x.ack.close();
});
test('real revision stream + applied receiver callback produce only received acknowledgment after delta',async()=>{
 const members=new Set([player]),sent=[];
 const stream=new Channel();
 const source=createArubaGmRevisionedCampaignSource({
  campaignId:campaign,gmUserId:gm,initialState:{scene:'start',secret:'GM-ONLY'},
  applyGmEvent:({state,payload})=>({...state,...payload}),
  projectVisibleSnapshot:({state})=>({scene:state.scene}),
  projectVisibleEvent:({event,payload})=>event==='active_scene_change'
   ?{event,payload:{scene:payload.scene}}:null,
 });
 const member=source.registerVerifiedPeer({peerId:peer,userId:player,verifiedCampaignId:campaign});
 const tracker=createArubaVerifiedRevisionConfirmation({
  campaignId:campaign,gmUserId:gm,
  isVerifiedMember:({userId})=>members.has(userId),
  getPublishedRevision:()=>member.revision,
  sendVerifiedResult:message=>sent.push(message),
 });
 const applied=[];
 const receiver=createArubaRevisionedPlayerReceiver({
  channel:stream,
  applySnapshot:()=>true,
  applyDelta:frame=>{applied.push(frame);return true;},
  onApplied:frame=>{
   if(frame.type==='visible-delta')
    tracker.acknowledge(observation(frame.revision));
  },
 });
 assert.ok(member.attachChannel(stream));
 await new Promise(resolve=>setImmediate(resolve));
 assert.equal(receiver.revision,0);
 assert.equal(tracker.expect(expected(req1,1)),true);
 assert.equal(source.commit({authenticatedGmUserId:gm,event:'notes_change',
  payload:{secret:'do not send'}}),true);
 assert.equal(sent.length,0);
 assert.equal(source.commit({authenticatedGmUserId:gm,event:'active_scene_change',
  payload:{scene:'ruins'}}),true);
 assert.equal(receiver.revision,1);
 assert.equal(applied[0].payload.scene,'ruins');
 assert.deepEqual(sent.map(x=>x.result),[{
  type:'map-command-result',requestId:req1,outcome:'received-revision',revision:1,
 }]);
 member.close();tracker.close();source.close();
});
test('failed UI delta application never produces acknowledgment',()=>{
 const x=setup();
 x.setRevision(1);
 x.ack.expect(expected(req1,1));
 const channel=new Channel();
 let errorCount=0;
 const receiver=createArubaRevisionedPlayerReceiver({
  channel,applySnapshot:()=>true,applyDelta:()=>false,
  onApplied:f=>{if(f.type==='visible-delta')x.ack.acknowledge(observation(f.revision));},
  onError:()=>{errorCount++;},
 });
 channel.send(JSON.stringify({type:'initial-snapshot',revision:0,payload:{scene:'start'}}));
 channel.send(JSON.stringify({type:'visible-delta',revision:1,event:'active_scene_change',
  payload:{scene:'ruins'}}));
 assert.equal(receiver.status,'closed');
 assert.equal(errorCount,1);
 assert.equal(x.ack.pendingCount,1);
 assert.deepEqual(x.sent,[]);
 x.ack.close();
});
