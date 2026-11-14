import test from 'node:test';
import assert from 'node:assert/strict';
import {createGameStateReplicator} from '../src/game-state-replicator.mjs';
const campaignId='12345678-1234-4123-8123-123456789abc';
const peerId='22345678-1234-4123-8123-123456789abc';
test('GM publishes revisioned snapshots, players accept newer revisions only',()=>{
 const sent=[],received=[];
 const gm=createGameStateReplicator({campaignId,role:'host',send:(data,target)=>{sent.push({data,target});return true;}});
 const player=createGameStateReplicator({campaignId,role:'player',send:()=>true,onSnapshot:x=>received.push(x)});
 const original={tokens:[{id:'t1',x:4}]};assert.equal(gm.publish(original),true);original.tokens[0].x=999;
 assert.equal(sent[0].data.state.tokens[0].x,4);
 assert.equal(player.receive({peerId:campaignId,payload:sent[0].data}),true);
 assert.equal(player.receive({peerId:campaignId,payload:sent[0].data}),false);
 assert.equal(player.publish({tokens:[]}),false);
 assert.equal(received.length,1);assert.equal(received[0].revision,1);
 assert.equal(gm.publish({tokens:[{id:'t1',x:5}]}),true);
 assert.equal(player.receive({peerId:campaignId,payload:sent[1].data}),true);
 assert.equal(player.getSnapshot().state.tokens[0].x,5);
});
test('GM responds to refresh requests only from valid peers and players cannot inject snapshots',()=>{
 const sent=[];const gm=createGameStateReplicator({campaignId,role:'host',send:(data,target)=>{sent.push({data,target});return true;}});
 gm.publish({scene:'crypt'});
 assert.equal(gm.receive({peerId:'invalid',payload:{kind:'request-snapshot',campaignId}}),false);
 assert.equal(gm.receive({peerId,payload:{kind:'snapshot',campaignId,revision:99,state:{scene:'fake'}}}),false);
 assert.equal(gm.receive({peerId,payload:{kind:'request-snapshot',campaignId}}),true);
 assert.equal(sent[1].target,peerId);assert.equal(sent[1].data.state.scene,'crypt');
});
test('cross-campaign and malformed state are rejected without changing player state',()=>{
 const player=createGameStateReplicator({campaignId,role:'player',send:()=>true});
 assert.equal(player.receive({peerId:campaignId,payload:{kind:'snapshot',campaignId:'different',revision:1,state:{}}}),false);
 assert.equal(player.receive({peerId:campaignId,payload:{kind:'snapshot',campaignId,revision:1,state:[]}}),false);
 assert.equal(player.receive({peerId:campaignId,payload:{kind:'snapshot',campaignId,revision:1,state:{valid:true}}}),true);
 assert.equal(player.receive({peerId:campaignId,payload:{kind:'snapshot',campaignId,revision:0,state:{valid:false}}}),false);
 assert.equal(player.getSnapshot().state.valid,true);
 player.close();assert.equal(player.requestSnapshot(),false);assert.equal(player.getSnapshot(),null);
});

test('player rejects snapshot from another peer even with a matching campaign envelope',()=>{
 const player=createGameStateReplicator({campaignId,role:'player',send:()=>true});
 assert.equal(player.receive({peerId,payload:{kind:'snapshot',campaignId,revision:1,state:{scene:'spoofed'}}}),false);
 assert.equal(player.getSnapshot(),null);
 assert.equal(player.receive({peerId:campaignId,payload:{kind:'snapshot',campaignId,revision:1,state:{scene:'real'}}}),true);
});

test('rejects deeply nested, excessively complex and prototype-shaped snapshots',()=>{
 const gm=createGameStateReplicator({campaignId,role:'host',send:()=>true});
 let nested={leaf:true};for(let i=0;i<40;i++)nested={child:nested};
 assert.throws(()=>gm.publish(nested),/complex/);
 assert.throws(()=>gm.publish(JSON.parse('{"__proto__":{"admin":true}}')),/Unsafe/);
 assert.throws(()=>gm.publish({constructor:{admin:true}}),/Unsafe/);
 const player=createGameStateReplicator({campaignId,role:'player',send:()=>true});
 assert.equal(player.receive({peerId:campaignId,payload:{kind:'snapshot',campaignId,revision:1,state:JSON.parse('{"__proto__":{"admin":true}}')}}),false);
 assert.equal(player.getSnapshot(),null);
});

test('player accepts a new GM revision epoch only after transport reconnection reset',()=>{
 const player=createGameStateReplicator({campaignId,role:'player',send:()=>true});
 const message=(revision,name)=>({peerId:campaignId,payload:{kind:'snapshot',campaignId,revision,state:{name}}});
 assert.equal(player.receive(message(45,'old')),true);
 assert.equal(player.receive(message(1,'new')),false);
 assert.equal(player.resetPlayerConnection(),true);
 assert.equal(player.getSnapshot(),null);
 assert.equal(player.receive(message(1,'new')),true);
 assert.equal(player.getSnapshot().state.name,'new');
 const gm=createGameStateReplicator({campaignId,role:'host',send:()=>true});
 assert.equal(gm.resetPlayerConnection(),false);
 player.close();assert.equal(player.resetPlayerConnection(),false);
});
