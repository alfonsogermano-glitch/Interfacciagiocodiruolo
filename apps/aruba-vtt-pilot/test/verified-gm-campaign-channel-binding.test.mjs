import test from 'node:test';
import assert from 'node:assert/strict';
import {createVerifiedGmCampaignChannelBinding} from '../src/ArubaVerifiedGmCampaignChannelBinding.mjs';
import {subscribeCampaignChannel} from '../src/ArubaCampaignChannelRuntime.mjs';

const campaign='00000000-0000-4000-8000-000000000001',gm='00000000-0000-4000-8000-000000000002';
const user='00000000-0000-4000-8000-000000000003',peerId='00000000-0000-4000-8000-000000000004';
class Channel{constructor(){this.readyState='open';this.handlers=new Map();this.out=[];}addEventListener(k,f){if(!this.handlers.has(k))this.handlers.set(k,new Set());this.handlers.get(k).add(f);}removeEventListener(k,f){this.handlers.get(k)?.delete(f);}send(v){this.out.push(JSON.parse(v));}receive(v){for(const f of this.handlers.get('message')??[])f({data:JSON.stringify(v)});}close(){this.readyState='closed';for(const f of [...(this.handlers.get('close')??[])])f();}}

test('GM runtime becomes ready only for an open server-verified peer and applies both policies',async()=>{
 const states=[],inbound=[];
 const local=subscribeCampaignChannel(campaign,{onReady:value=>states.push(value),onBroadcast:{map_token_action:message=>inbound.push(message)}});
 const binding=createVerifiedGmCampaignChannelBinding({campaignId:campaign,gmUserId:gm,
  authorizePlayerEvent:({userId,event})=>userId===user&&event==='map_token_action',
  authorizeHostEvent:({toUserId,event})=>toUserId===user&&event==='active_scene_change'});
 const channel=new Channel();
 assert.equal(local.ready,false);assert.equal(binding.attachChannel(peerId,channel),false);
 assert.equal(binding.onVerifiedPeer({peerId,userId:user,campaignId:campaign}),true);
 assert.equal(binding.attachChannel(peerId,channel),true);assert.equal(local.ready,true);
 assert.equal(await local.send('active_scene_change',{sceneId:'s1'}),true);
 assert.deepEqual(channel.out,[{event:'active_scene_change',payload:{sceneId:'s1',arubaMapRevision:1}}]);
 channel.receive({event:'map_token_action',payload:{action:'move'}});
 channel.receive({event:'active_scene_change',payload:{sceneId:'forged'}});
 assert.deepEqual(inbound,[{event:'map_token_action',payload:{action:'move'}}]);
 binding.onPeerRevoked({peerId,userId:user,campaignId:campaign});assert.equal(local.ready,false);
 assert.deepEqual(states,[false,true,false]);binding.close();local.close();
});

test('binding requires explicit policies and unique runtime ownership',()=>{
 assert.throws(()=>createVerifiedGmCampaignChannelBinding({campaignId:campaign,gmUserId:gm}),/policies/);
 const first=createVerifiedGmCampaignChannelBinding({campaignId:campaign,gmUserId:gm,authorizePlayerEvent:()=>false,authorizeHostEvent:()=>false});
 assert.throws(()=>createVerifiedGmCampaignChannelBinding({campaignId:campaign,gmUserId:gm,authorizePlayerEvent:()=>false,authorizeHostEvent:()=>false}),/Unique verified/);
 first.close();
});

test('binding can route an authorized player event to a trusted receiver instead of broadcasting raw payload',()=>{
 const received=[];const binding=createVerifiedGmCampaignChannelBinding({campaignId:campaign,gmUserId:gm,
  authorizePlayerEvent:()=>true,authorizeHostEvent:()=>false,receivePlayerEvent:message=>{received.push(message);return true;}});
 const channel=new Channel();binding.onVerifiedPeer({peerId,userId:user,campaignId:campaign});binding.attachChannel(peerId,channel);
 assert.equal(binding.hasAttachedUser(user),true);channel.receive({event:'map_token_action',payload:{action:'move'}});
 assert.equal(received[0].fromUserId,user);binding.close();
});

test('verified host may publish an already policy-projected scene through the binding',()=>{
 const binding=createVerifiedGmCampaignChannelBinding({campaignId:campaign,gmUserId:gm,
  authorizePlayerEvent:()=>false,authorizeHostEvent:({event})=>event==='active_scene_change'});
 const channel=new Channel();binding.onVerifiedPeer({peerId,userId:user,campaignId:campaign});binding.attachChannel(peerId,channel);
 assert.equal(binding.publishHostEvent('active_scene_change',{activeScene:{id:'scene'}}),true);
 assert.deepEqual(channel.out,[{event:'active_scene_change',payload:{activeScene:{id:'scene'},arubaMapRevision:1}}]);binding.close();
});
