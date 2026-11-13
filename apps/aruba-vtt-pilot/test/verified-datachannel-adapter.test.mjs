import test from 'node:test';
import assert from 'node:assert/strict';
import {createGmHostEventRouter} from '../src/ArubaGmHostEventRouter.mjs';
import {attachVerifiedPlayerDataChannel} from '../src/ArubaVerifiedDataChannelAdapter.mjs';

const campaign='00000000-0000-4000-8000-000000000001';
const gm='00000000-0000-4000-8000-000000000002';
const player='00000000-0000-4000-8000-000000000003';
const other='00000000-0000-4000-8000-000000000009';
class FakeChannel {
 constructor(){this.readyState='open';this.handlers=new Map();this.sent=[];}
 addEventListener(name,callback){let list=this.handlers.get(name);if(!list){list=new Set();this.handlers.set(name,list);}list.add(callback);}
 removeEventListener(name,callback){this.handlers.get(name)?.delete(callback);}
 send(content){this.sent.push(content);}
 emit(name,data){for(const cb of [...(this.handlers.get(name)??[])])cb({data});}
 close(){this.readyState='closed';this.emit('close');}
}
const make=(options={})=>createGmHostEventRouter({campaignId:campaign,gmUserId:gm,...options});
test('only separately verified campaign member can bind a data channel',()=>{
 const router=make({authorizePlayerEvent:()=>true});
 router.openVerifiedHost({authenticatedUserId:gm,receiveFromPlayer:()=>{}});
 const unknown=new FakeChannel();
 assert.equal(attachVerifiedPlayerDataChannel({router,channel:unknown,peerId:'p',
  authenticatedUserId:other,verifiedCampaignId:'wrong'}),null);
 assert.equal(unknown.handlers.size,0);
 assert.equal(attachVerifiedPlayerDataChannel({router,channel:unknown,peerId:'p',
  authenticatedUserId:gm,verifiedCampaignId:campaign}),null);
 assert.equal(unknown.handlers.size,0);
});
test('a verified player may send only allowed original events to authoritative GM',()=>{
 const inbox=[];
 const router=make({authorizePlayerEvent:({event,userId,payload})=>
  userId===player&&event==='chat_message'&&payload?.fromUserId===undefined});
 router.openVerifiedHost({authenticatedUserId:gm,receiveFromPlayer:msg=>inbox.push(msg)});
 const channel=new FakeChannel();
 const connection=attachVerifiedPlayerDataChannel({router,channel,peerId:'trusted-peer',
  authenticatedUserId:player,verifiedCampaignId:campaign});
 assert.ok(connection);
 channel.emit('message',JSON.stringify({event:'active_scene_change',payload:{scene:'forged'}}));
 channel.emit('message',JSON.stringify({event:'chat_message',payload:{text:'hello'}}));
 channel.emit('message',JSON.stringify({event:'chat_message',payload:{text:'forged',fromUserId:gm}}));
 channel.emit('message',JSON.stringify({event:'chat_message',payload:{text:'forged'},fromUserId:gm}));
 channel.emit('message','not-json');
 channel.emit('message',JSON.stringify({event:'chat_message',payload:{text:'x'.repeat(70000)}}));
 assert.equal(inbox.length,1);
 assert.equal(inbox[0].fromUserId,player);
 assert.equal(inbox[0].event,'chat_message');
 assert.equal(inbox[0].payload.text,'hello');
 connection.disconnect();
 channel.emit('message',JSON.stringify({event:'chat_message',payload:{text:'late'}}));
 assert.equal(inbox.length,1);
});
test('GM-only events leave channel only under per-user outbound visibility policy',()=>{
 const router=make({authorizeHostEvent:({toUserId,event})=>
  toUserId===player&&event==='active_scene_change'});
 const host=router.openVerifiedHost({authenticatedUserId:gm,receiveFromPlayer:()=>{}});
 const ch1=new FakeChannel(),ch2=new FakeChannel();
 const first=attachVerifiedPlayerDataChannel({router,channel:ch1,peerId:'peer-a',
  authenticatedUserId:player,verifiedCampaignId:campaign});
 attachVerifiedPlayerDataChannel({router,channel:ch2,peerId:'peer-b',
  authenticatedUserId:other,verifiedCampaignId:campaign});
 host.publish('active_scene_change',{id:'scene-1'});
 host.publish('notes_change',{secret:'GM only'});
 assert.deepEqual(ch1.sent.map(x=>JSON.parse(x)),[
  {event:'active_scene_change',payload:{id:'scene-1'}},
 ]);
 assert.equal(ch2.sent.length,0);
 first.disconnect();
 host.publish('active_scene_change',{id:'scene-2'});
 assert.equal(ch1.sent.length,1);
});
test('closing channel and GM invalidates old verified peer session',()=>{
 const inbox=[];
 const router=make({authorizePlayerEvent:()=>true});
 const host=router.openVerifiedHost({authenticatedUserId:gm,receiveFromPlayer:m=>inbox.push(m)});
 const ch=new FakeChannel();
 const handle=attachVerifiedPlayerDataChannel({router,channel:ch,peerId:'p',
  authenticatedUserId:player,verifiedCampaignId:campaign});
 assert.equal(host.connectedPlayers,1);
 ch.close();
 assert.equal(host.connectedPlayers,0);
 ch.emit('message',JSON.stringify({event:'chat_message',payload:{text:'late'}}));
 assert.equal(inbox.length,0);
 handle.disconnect();
 assert.equal(host.connectedPlayers,0);
});
test('sending to a closed DataChannel does not expose GM-only data',()=>{
 const router=make({authorizeHostEvent:()=>true});
 const host=router.openVerifiedHost({authenticatedUserId:gm,receiveFromPlayer:()=>{}});
 const channel=new FakeChannel();
 attachVerifiedPlayerDataChannel({router,channel,peerId:'p',
  authenticatedUserId:player,verifiedCampaignId:campaign});
 channel.readyState='closing';
 assert.equal(host.publish('active_scene_change',{id:'scene'}),true);
 assert.equal(channel.sent.length,0);
});
