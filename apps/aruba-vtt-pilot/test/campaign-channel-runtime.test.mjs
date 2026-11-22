import test from 'node:test';
import assert from 'node:assert/strict';
import {hasReadyCampaignTransport,installCampaignChannelTransport,subscribeCampaignChannel} from '../src/ArubaCampaignChannelRuntime.mjs';

const campaign='33333333-3333-4333-8333-333333333333';

test('campaign runtime stays unavailable until exact transport is installed and open',async()=>{
 const states=[];const absent=subscribeCampaignChannel(campaign,{onReady:value=>states.push(value)});
 assert.equal(absent.ready,false);assert.equal(await absent.send('dice_roll',{}),false);
 const sent=[];
 const transport=installCampaignChannelTransport({campaignId:campaign,send:async(event,payload)=>{sent.push({event,payload});return true;}});
 assert.equal(absent.ready,false);assert.equal(await absent.send('dice_roll',{value:2}),false);
 assert.equal(transport.setReady(true),true);assert.equal(absent.ready,true);assert.equal(hasReadyCampaignTransport(campaign),true);
 assert.equal(await absent.send('dice_roll',{value:2}),true);assert.deepEqual(sent,[{event:'dice_roll',payload:{value:2}}]);
 transport.close();assert.equal(absent.ready,false);assert.deepEqual(states,[false,true,false]);absent.close();
});

test('runtime isolates campaigns, unknown events, mutation and listener failures',()=>{
 const received=[];const transport=installCampaignChannelTransport({campaignId:campaign,send:()=>true});transport.setReady(true);
 const active=subscribeCampaignChannel(campaign,{onReady:()=>{},onBroadcast:{
  map_token_action:message=>{received.push(message);message.payload.x=99;},
 }});
 const second=subscribeCampaignChannel(campaign,{onReady:()=>{},onBroadcast:{map_token_action:message=>received.push(message)}});
 assert.equal(transport.receive('unknown',{}),false);
 assert.equal(transport.receive('map_token_action',{x:1}),true);
 assert.equal(received[1].payload.x,1);
 assert.throws(()=>installCampaignChannelTransport({campaignId:campaign,send:()=>true}),/Unique verified/);
 active.close();second.close();transport.close();
});
