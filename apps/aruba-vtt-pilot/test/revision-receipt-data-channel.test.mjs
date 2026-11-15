import test from 'node:test';
import assert from 'node:assert/strict';
import {createArubaPlayerRevisionReceiptSender,attachArubaVerifiedGmRevisionReceipt}
 from '../src/ArubaRevisionReceiptDataChannel.mjs';
import {createArubaVerifiedRevisionConfirmation}
 from '../src/ArubaVerifiedRevisionConfirmation.mjs';

const campaign='00000000-0000-4000-8000-000000000001';
const gm='00000000-0000-4000-8000-000000000002';
const user='00000000-0000-4000-8000-000000000003';
const peer='00000000-0000-4000-8000-000000000004';
const other='00000000-0000-4000-8000-000000000005';
const request='00000000-0000-4000-8000-000000000006';
class Channel{
 constructor(){this.readyState='open';this.handlers=new Map();this.sent=[];}
 addEventListener(name,cb){if(!this.handlers.has(name))this.handlers.set(name,new Set());this.handlers.get(name).add(cb);}
 removeEventListener(name,cb){this.handlers.get(name)?.delete(cb);}
 send(value){this.sent.push(value);this.emit('message',{data:value});}
 emit(name,event={}){for(const cb of [...(this.handlers.get(name)??[])])cb(event);}
 close(){this.readyState='closed';this.emit('close');}
}
const setup=()=>{
 const channel=new Channel(),members=new Set([user]),sent=[];
 let published=0;
 const tracker=createArubaVerifiedRevisionConfirmation({
  campaignId:campaign,gmUserId:gm,
  isVerifiedMember:({userId})=>members.has(userId),
  getPublishedRevision:()=>published,
  sendVerifiedResult:x=>sent.push(x),
 });
 const host=attachArubaVerifiedGmRevisionReceipt({channel,
  authenticatedUserId:user,verifiedCampaignId:campaign,peerId:peer,tracker});
 const player=createArubaPlayerRevisionReceiptSender({channel});
 const expect=revision=>tracker.expect({userId:user,peerId:peer,requestId:request,revision});
 return {channel,members,sent,tracker,host,player,expect,setPublished:n=>{published=n;}};
};
test('applied delta reaches only verified GM tracker and produces a correlated response',()=>{
 const x=setup();
 assert.equal(x.expect(2),true);
 x.setPublished(2);
 assert.equal(x.player.send({type:'visible-delta',revision:2}),true);
 assert.deepEqual(x.sent,[{campaignId:campaign,toUserId:user,result:{
  type:'map-command-result',requestId:request,outcome:'received-revision',revision:2,
 }}]);
 x.host.close();x.player.close();x.tracker.close();
});
test('receipt cannot claim a revision that GM has not published',()=>{
 const x=setup();x.expect(1);
 assert.equal(x.player.send({type:'visible-delta',revision:1}),true);
 assert.deepEqual(x.sent,[]);
 x.setPublished(1);
 assert.equal(x.player.send({type:'visible-delta',revision:1}),false);
 // Duplicate receipt from the same channel may now be processed only after publication.
 x.channel.send(JSON.stringify({type:'applied-revision',revision:1}));
 assert.equal(x.sent.length,1);
 x.host.close();x.player.close();x.tracker.close();
});
test('technical schema refuses impersonation, unknown fields, oversized or game event frames',()=>{
 const x=setup();x.expect(1);x.setPublished(1);
 for(const frame of [
  {type:'applied-revision',revision:1,fromUserId:user},
  {type:'applied-revision',revision:1,campaignId:campaign},
  {type:'applied-revision',revision:1,peerId:peer},
  {type:'applied-revision',revision:1,requestId:request},
  {type:'applied-revision',revision:1.5},
  {type:'visible-delta',revision:1,event:'active_scene_change',payload:{}},
  {type:'applied-revision',revision:9999999999999999},
 ]){
  x.channel.send(JSON.stringify(frame));
 }
 x.channel.send('{invalid');
 x.channel.send('x'.repeat(300));
 assert.deepEqual(x.sent,[]);
 x.channel.send(JSON.stringify({type:'applied-revision',revision:1}));
 assert.equal(x.sent.length,1);
 x.host.close();x.player.close();x.tracker.close();
});
test('peer close revokes pending acknowledgments even if an identical peer reconnects',()=>{
 const x=setup();x.expect(2);x.setPublished(2);
 x.channel.close();
 assert.equal(x.tracker.pendingCount,0);
 x.channel.readyState='open';
 x.channel.send(JSON.stringify({type:'applied-revision',revision:2}));
 assert.deepEqual(x.sent,[]);
 x.host.close();x.player.close();x.tracker.close();
});
test('wrong verified campaign and membership revocation block receipts',()=>{
 const x=setup();x.expect(1);x.setPublished(1);
 const second=new Channel();
 const mismatched=attachArubaVerifiedGmRevisionReceipt({
  channel:second,authenticatedUserId:user,verifiedCampaignId:other,peerId:peer,tracker:x.tracker,
 });
 second.send(JSON.stringify({type:'applied-revision',revision:1}));
 assert.deepEqual(x.sent,[]);
 mismatched.close();
 x.members.delete(user);
 x.channel.send(JSON.stringify({type:'applied-revision',revision:1}));
 assert.deepEqual(x.sent,[]);
 x.host.close();x.player.close();x.tracker.close();
});
test('sender only sends after original receiver onApplied and only once per revision',()=>{
 const x=setup();
 assert.equal(x.player.send({type:'foo',revision:0}),false);
 assert.equal(x.player.send({type:'initial-snapshot',revision:0}),true);
 assert.equal(x.player.send({type:'visible-delta',revision:0}),false);
 assert.equal(x.player.send({type:'visible-delta',revision:1}),true);
 assert.deepEqual(x.channel.sent.map(v=>JSON.parse(v).revision),[0,1]);
 x.player.close();
 assert.equal(x.player.send({type:'visible-delta',revision:2}),false);
 x.host.close();x.tracker.close();
});
