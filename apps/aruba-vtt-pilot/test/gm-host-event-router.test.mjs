import test from 'node:test';
import assert from 'node:assert/strict';
import {createGmHostEventRouter} from '../src/ArubaGmHostEventRouter.mjs';
import {KNOWN_BROADCAST_EVENTS} from '../../../src/services/realtime/campaignChannelContract.ts';
const owner='00000000-0000-4000-8000-000000000002';
const player='00000000-0000-4000-8000-000000000003';
const campaign='00000000-0000-4000-8000-000000000001';
const other='00000000-0000-4000-8000-000000000009';
const make=(options={})=>createGmHostEventRouter({campaignId:campaign,gmUserId:owner,...options});

test('only verified GM may open host, only verified same-campaign players join',()=>{
 const relay=make();
 assert.equal(relay.openVerifiedHost({authenticatedUserId:player,receiveFromPlayer:()=>{}}),null);
 assert.equal(relay.attachVerifiedPlayer({peerId:'p',authenticatedUserId:player,verifiedCampaignId:campaign,receiveFromHost:()=>{}}),null);
 const host=relay.openVerifiedHost({authenticatedUserId:owner,receiveFromPlayer:()=>{}});
 assert.ok(host);
 assert.equal(relay.openVerifiedHost({authenticatedUserId:owner,receiveFromPlayer:()=>{}}),null);
 assert.equal(relay.attachVerifiedPlayer({peerId:'p',authenticatedUserId:player,verifiedCampaignId:other,receiveFromHost:()=>{}}),null);
 assert.equal(relay.attachVerifiedPlayer({peerId:'p',authenticatedUserId:owner,verifiedCampaignId:campaign,receiveFromHost:()=>{}}),null);
 assert.equal(host.connectedPlayers,0);
});

test('GM events broadcast only to registered campaign peers; listeners isolated',()=>{
 const errors=[],received=[];
 const relay=make({onDeliveryError:e=>errors.push(e.message),
  authorizeHostEvent:({event})=>event==='active_scene_change'});
 const host=relay.openVerifiedHost({authenticatedUserId:owner,receiveFromPlayer:()=>{}});
 relay.attachVerifiedPlayer({peerId:'broken',authenticatedUserId:player,verifiedCampaignId:campaign,receiveFromHost:()=>{throw Error('bad listener');}});
 relay.attachVerifiedPlayer({peerId:'good',authenticatedUserId:other,verifiedCampaignId:campaign,receiveFromHost:frame=>received.push(frame)});
 const payload={activeScene:{id:'scene-1'}};
 assert.equal(host.publish('active_scene_change',payload),true);
 payload.activeScene.id='CHANGED';
 assert.deepEqual(received,[{campaignId:campaign,event:'active_scene_change',payload:{activeScene:{id:'scene-1'}}}]);
 assert.deepEqual(errors,['bad listener']);
 for(const event of KNOWN_BROADCAST_EVENTS)assert.equal(host.publish(event,{test:true}),true);
 assert.equal(host.publish('unknown',{test:true}),false);
 assert.equal(host.publish('active_scene_change',{data:'x'.repeat(65536)}),false);
});

test('GM delivery is denied by default and selectively authorized for each player',()=>{
 const visible=[],privateFrames=[];
 const relay=make({authorizeHostEvent:({toUserId,event})=>
  toUserId===player&&event==='active_scene_change'});
 const gm=relay.openVerifiedHost({authenticatedUserId:owner,receiveFromPlayer:()=>{}});
 relay.attachVerifiedPlayer({peerId:'authorized',authenticatedUserId:player,
  verifiedCampaignId:campaign,receiveFromHost:f=>visible.push(f)});
 relay.attachVerifiedPlayer({peerId:'other',authenticatedUserId:other,
  verifiedCampaignId:campaign,receiveFromHost:f=>privateFrames.push(f)});
 assert.equal(gm.publish('active_scene_change',{activeScene:{id:'visible'}}),true);
 assert.equal(gm.publish('notes_change',{secret:'GM-only'}),true);
 assert.equal(visible.length,1);
 assert.equal(privateFrames.length,0);
 const restricted=make();
 const host=restricted.openVerifiedHost({authenticatedUserId:owner,receiveFromPlayer:()=>{}});
 restricted.attachVerifiedPlayer({peerId:'blocked',authenticatedUserId:player,
  verifiedCampaignId:campaign,receiveFromHost:()=>{throw Error('must remain private')}});
 assert.equal(host.publish('active_scene_change',{activeScene:{id:'test'}}),true);
});
test('player messages deny by default, and GM-only scene/map events remain forbidden',()=>{
 const received=[];
 const relay=make({authorizePlayerEvent:({event,userId,payload})=>
  event==='chat_message'&&userId===player&&payload.text==='hello'});
 relay.openVerifiedHost({authenticatedUserId:owner,receiveFromPlayer:message=>received.push(message)});
 const peer=relay.attachVerifiedPlayer({peerId:'p',authenticatedUserId:player,verifiedCampaignId:campaign,receiveFromHost:()=>{}});
 assert.equal(peer.publish('active_scene_change',{activeScene:{id:'hacked'}}),false);
 assert.equal(peer.publish('map_history_action',{undo:true}),false);
 assert.equal(peer.publish('map_object_layer_action',{objectId:'x'}),false);
 assert.equal(peer.publish('chat_message',{text:'no'}),false);
 assert.equal(peer.publish('chat_message',{text:'hello'}),true);
 assert.deepEqual(received,[{campaignId:campaign,fromUserId:player,event:'chat_message',payload:{text:'hello'}}]);
 const none=make();
 none.openVerifiedHost({authenticatedUserId:owner,receiveFromPlayer:()=>{throw Error('should never deliver')}});
 const denied=none.attachVerifiedPlayer({peerId:'p',authenticatedUserId:player,verifiedCampaignId:campaign,receiveFromHost:()=>{}});
 assert.equal(denied.publish('chat_message',{text:'hello'}),false);
});

test('disconnect revokes old peer handles and closing GM invalidates entire generation',()=>{
 const received=[];
 const relay=make({authorizePlayerEvent:()=>true});
 const host=relay.openVerifiedHost({authenticatedUserId:owner,receiveFromPlayer:m=>received.push(m)});
 const oldPeer=relay.attachVerifiedPlayer({peerId:'same',authenticatedUserId:player,verifiedCampaignId:campaign,receiveFromHost:()=>{}});
 oldPeer.disconnect();
 assert.equal(oldPeer.publish('chat_message',{text:'one'}),false);
 const newPeer=relay.attachVerifiedPlayer({peerId:'same',authenticatedUserId:other,verifiedCampaignId:campaign,receiveFromHost:()=>{}});
 assert.equal(newPeer.publish('chat_message',{text:'two'}),true);
 host.disconnect();
 assert.equal(host.publish('active_scene_change',{activeScene:null}),false);
 assert.equal(newPeer.publish('chat_message',{text:'three'}),false);
 assert.equal(relay.hostOnline,false);
 const next=relay.openVerifiedHost({authenticatedUserId:owner,receiveFromPlayer:m=>received.push(m)});
 assert.equal(next.connectedPlayers,0);
 assert.equal(newPeer.publish('chat_message',{text:'four'}),false);
 assert.equal(received.length,1);
});

test('rejects forged fields, oversized frames, circular payloads, and throwing policy',()=>{
 let errors=0;
 const relay=make({authorizePlayerEvent:()=>{throw Error('policy down')},onDeliveryError:()=>{errors++}});
 const host=relay.openVerifiedHost({authenticatedUserId:owner,receiveFromPlayer:()=>{}});
 const peer=relay.attachVerifiedPlayer({peerId:'one',authenticatedUserId:player,verifiedCampaignId:campaign,receiveFromHost:()=>{}});
 assert.equal(peer.publish('chat_message',{text:'hi',fromUserId:owner}),false);
 assert.equal(errors,1);
 const loop={};loop.self=loop;
 assert.equal(host.publish('dice_roll',loop),false);
 assert.equal(host.publish('dice_roll',{text:'x'.repeat(65536)}),false);
 assert.equal(host.publish('__proto__',{x:true}),false);
 assert.equal(host.publish('dice_roll',[]),false);
});
