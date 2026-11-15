import test from 'node:test';
import assert from 'node:assert/strict';
import {createSignalingSessionCoordinator} from '../src/signaling-session-coordinator.mjs';
const campaign='00000000-0000-4000-8000-000000000001';
const owner='00000000-0000-4000-8000-000000000002';
const player='00000000-0000-4000-8000-000000000003';
const other='00000000-0000-4000-8000-000000000004';
const sessions=new Map([['host',owner],['player',player],['other',other]]);
const revoked=new Set();
function setup(policies={}){
 const calls=[];
 const identity={async verify({sessionToken,campaignId,connectionRole}){
  calls.push([sessionToken,campaignId,connectionRole]);
  const userId=sessions.get(sessionToken);
  if(!userId||revoked.has(sessionToken)||campaignId!==campaign)throw Error('unauthorized');
  if(connectionRole==='host'&&userId!==owner)throw Error('not owner');
  if(connectionRole==='player'&&userId===owner)throw Error('not player');
  return {userId,campaignId,role:connectionRole==='host'?'gm':'player'};
 }};
 return {calls,coordinator:createSignalingSessionCoordinator({identity,...policies})};
}
test('no room exists without a verified GM and double hosting is blocked',async()=>{
 revoked.clear();
 const {coordinator}=setup();
 assert.equal(await coordinator.joinPlayer({sessionToken:'player',campaignId:campaign,
  peerId:'x',receiveFromHost:()=>{}}),null);
 await assert.rejects(coordinator.openHost({sessionToken:'player',campaignId:campaign,
  receiveFromPlayer:()=>{}}));
 const host=await coordinator.openHost({sessionToken:'host',campaignId:campaign,
  receiveFromPlayer:()=>{}});
 assert.ok(host);
 assert.equal(await coordinator.openHost({sessionToken:'host',campaignId:campaign,
  receiveFromPlayer:()=>{}}),null);
 host.disconnect();
});
test('player events are authorized, verified again, and attributed to session',async()=>{
 revoked.clear();
 const messages=[];
 const {coordinator,calls}=setup({authorizePlayerEvent:({event})=>event==='chat_message'});
 const host=await coordinator.openHost({sessionToken:'host',campaignId:campaign,
  receiveFromPlayer:message=>messages.push(message)});
 const peer=await coordinator.joinPlayer({sessionToken:'player',campaignId:campaign,
  peerId:'p',receiveFromHost:()=>{}});
 assert.equal(await peer.publish('chat_message',{text:'hello'}),true);
 assert.equal(await peer.publish('active_scene_change',{activeScene:{id:'x'}}),false);
 assert.deepEqual(messages,[{campaignId:campaign,fromUserId:player,
  event:'chat_message',payload:{text:'hello'}}]);
 assert.ok(calls.filter(x=>x[0]==='player').length>=2);
 host.disconnect();
});
test('GM outbound messages remain denied unless a visibility policy approves',async()=>{
 revoked.clear();
 const received=[];
 const {coordinator}=setup();
 const host=await coordinator.openHost({sessionToken:'host',campaignId:campaign,
  receiveFromPlayer:()=>{}});
 await coordinator.joinPlayer({sessionToken:'player',campaignId:campaign,
  peerId:'p',receiveFromHost:message=>received.push(message)});
 assert.equal(await host.publish('active_scene_change',{activeScene:{id:'one'}}),true);
 assert.deepEqual(received,[]);
 host.disconnect();
});
test('membership revocation suppresses outbound GM events and inbound player events',async()=>{
 revoked.clear();
 const received=[];
 const {coordinator}=setup({authorizeHostEvent:()=>true,authorizePlayerEvent:()=>true});
 const host=await coordinator.openHost({sessionToken:'host',campaignId:campaign,
  receiveFromPlayer:message=>received.push(message)});
 const peer=await coordinator.joinPlayer({sessionToken:'player',campaignId:campaign,
  peerId:'p',receiveFromHost:message=>received.push(message)});
 revoked.add('player');
 assert.equal(await host.publish('active_scene_change',{activeScene:{id:'secret'}}),true);
 assert.equal(host.connectedPlayers,0);
 assert.equal(await peer.publish('chat_message',{text:'secret'}),false);
 assert.deepEqual(received,[]);
 revoked.clear();host.disconnect();
});
test('host revocation closes room, and reconnect requires new verified host',async()=>{
 revoked.clear();
 const received=[];
 const {coordinator}=setup({authorizeHostEvent:()=>true});
 const host=await coordinator.openHost({sessionToken:'host',campaignId:campaign,
  receiveFromPlayer:()=>{}});
 const peer=await coordinator.joinPlayer({sessionToken:'player',campaignId:campaign,
  peerId:'p',receiveFromHost:m=>received.push(m)});
 revoked.add('host');
 assert.equal(await host.publish('active_scene_change',{activeScene:{id:'secret'}}),false);
 assert.equal(await peer.publish('chat_message',{text:'hi'}),false);
 revoked.clear();
 const replacement=await coordinator.openHost({sessionToken:'host',campaignId:campaign,
  receiveFromPlayer:()=>{}});
 assert.ok(replacement);
 assert.equal(await peer.publish('chat_message',{text:'old'}),false);
 replacement.disconnect();
});
test('reused peer ID cannot steal a still-live connection; disconnect frees it',async()=>{
 revoked.clear();
 const {coordinator}=setup();
 const host=await coordinator.openHost({sessionToken:'host',campaignId:campaign,
  receiveFromPlayer:()=>{}});
 const one=await coordinator.joinPlayer({sessionToken:'player',campaignId:campaign,
  peerId:'p',receiveFromHost:()=>{}});
 assert.equal(await coordinator.joinPlayer({sessionToken:'other',campaignId:campaign,
  peerId:'p',receiveFromHost:()=>{}}),null);
 one.disconnect();
 const replacement=await coordinator.joinPlayer({sessionToken:'other',campaignId:campaign,
  peerId:'p',receiveFromHost:()=>{}});
 assert.ok(replacement);
 host.disconnect();
});
