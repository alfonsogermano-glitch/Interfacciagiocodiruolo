import test from 'node:test';import assert from 'node:assert/strict';
import {createVerifiedPlayerCampaignChannelBinding} from '../src/ArubaVerifiedPlayerCampaignChannelBinding.mjs';
import {subscribeCampaignChannel} from '../src/ArubaCampaignChannelRuntime.mjs';
const campaign='00000000-0000-4000-8000-000000000001',owner='00000000-0000-4000-8000-000000000002',user='00000000-0000-4000-8000-000000000003';
class Channel{constructor(){this.readyState='open';this.handlers=new Map();this.out=[];}addEventListener(k,f){if(!this.handlers.has(k))this.handlers.set(k,new Set());this.handlers.get(k).add(f);}removeEventListener(k,f){this.handlers.get(k)?.delete(f);}send(v){this.out.push(JSON.parse(v));}receive(v){for(const f of this.handlers.get('message')??[])f({data:JSON.stringify(v)});}close(){this.readyState='closed';for(const f of [...(this.handlers.get('close')??[])])f();}}
test('verified player binding permits candidate requests and receives only host allowlist',async()=>{
 const seen=[],states=[];const local=subscribeCampaignChannel(campaign,{onReady:x=>states.push(x),onBroadcast:{active_scene_change:x=>seen.push(x)}});const channel=new Channel();
 const binding=createVerifiedPlayerCampaignChannelBinding({campaignId:campaign,userId:user,ownerId:owner,channel});
 assert.equal(local.ready,true);assert.equal(await local.send('map_token_action',{action:'move'}),true);assert.equal(await local.send('active_scene_change',{forged:true}),false);
 assert.deepEqual(channel.out,[{event:'map_token_action',payload:{action:'move'}}]);
 channel.receive({event:'active_scene_change',payload:{sceneId:'s1',arubaMapRevision:7}});channel.receive({event:'map_token_action',payload:{forged:true}});
 assert.deepEqual(seen,[{event:'active_scene_change',payload:{sceneId:'s1',arubaMapRevision:7}}]);
 channel.close();assert.equal(local.ready,false);assert.deepEqual(states,[false,true,false]);binding.close();local.close();
});
test('player accepts a fresh revision epoch then closes on gaps or regression',()=>{
 const channel=new Channel();const states=[];const local=subscribeCampaignChannel(campaign,{onReady:value=>states.push(value)});
 createVerifiedPlayerCampaignChannelBinding({campaignId:campaign,userId:user,ownerId:owner,channel});
 channel.receive({event:'active_scene_change',payload:{activeScene:{id:'a'},arubaMapRevision:12}});
 channel.receive({event:'active_scene_change',payload:{activeScene:{id:'b'},arubaMapRevision:14}});
 assert.equal(channel.readyState,'closed');assert.equal(local.ready,false);assert.deepEqual(states,[false,true,false]);local.close();
});
test('player binding rejects owner impersonation and unopened channels',()=>{
 assert.throws(()=>createVerifiedPlayerCampaignChannelBinding({campaignId:campaign,userId:owner,ownerId:owner,channel:new Channel()}),/Verified player/);
 const channel=new Channel();channel.readyState='connecting';assert.throws(()=>createVerifiedPlayerCampaignChannelBinding({campaignId:campaign,userId:user,ownerId:owner,channel}),/Verified player/);
});
