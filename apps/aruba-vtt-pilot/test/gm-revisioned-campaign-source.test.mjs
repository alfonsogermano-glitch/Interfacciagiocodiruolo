import test from 'node:test';
import assert from 'node:assert/strict';
import {createArubaGmRevisionedCampaignSource} from '../src/ArubaGmRevisionedCampaignSource.mjs';

const campaign='00000000-0000-4000-8000-000000000001';
const gm='00000000-0000-4000-8000-000000000002';
const alice='00000000-0000-4000-8000-000000000003';
const bob='00000000-0000-4000-8000-000000000004';
const idA='00000000-0000-4000-8000-000000000005';
const idB='00000000-0000-4000-8000-000000000006';
const tick=()=>new Promise(resolve=>setImmediate(resolve));
class Channel{
 constructor(){this.readyState='open';this.listeners=new Map();this.sent=[];}
 addEventListener(name,fn){if(!this.listeners.has(name))this.listeners.set(name,new Set());this.listeners.get(name).add(fn);}
 removeEventListener(name,fn){this.listeners.get(name)?.delete(fn);}
 send(data){if(this.readyState!=='open')throw Error('Channel closed');this.sent.push(JSON.parse(data));}
 close(){if(this.readyState==='closed')return;this.readyState='closed';for(const fn of [...(this.listeners.get('close')??[])])fn();}
}
function setup(overrides={}){
 const errors=[];
 const source=createArubaGmRevisionedCampaignSource({
  campaignId:campaign,gmUserId:gm,
  initialState:{scene:'start',secret:'GM SECRET'},
  applyGmEvent:({state,payload,event})=>event==='active_scene_change'
   ?{...state,scene:payload.scene}:{...state,secret:payload.secret??state.secret},
  projectVisibleSnapshot:({state,userId})=>userId===alice
   ?{scene:state.scene,viewer:userId}:{viewer:userId},
  projectVisibleEvent:({event,payload,userId})=>
   event==='active_scene_change'&&userId===alice
    ?{event,payload:{scene:payload.scene}}:null,
  onError:error=>errors.push(error.message),
  ...overrides,
 });
 const register=(peerId,userId)=>source.registerVerifiedPeer({peerId,userId,verifiedCampaignId:campaign});
 const commit=(event,payload)=>source.commit({authenticatedGmUserId:gm,event,payload});
 return {source,register,commit,errors};
}
test('per-player revisions advance only on visible events; GM secrets never count or leak',async()=>{
 const {source,register,commit}=setup();
 const a=register(idA,alice),b=register(idB,bob);
 const ca=new Channel(),cb=new Channel();
 a.attachChannel(ca);b.attachChannel(cb);
 await tick();await tick();
 assert.equal(commit('notes_change',{secret:'SUPER PRIVATE'}),true);
 assert.equal(a.revision,0);
 assert.equal(b.revision,0);
 assert.equal(commit('active_scene_change',{scene:'forest'}),true);
 assert.equal(a.revision,1);
 assert.equal(b.revision,0);
 assert.deepEqual(ca.sent,[
  {type:'initial-snapshot',revision:0,payload:{scene:'start',viewer:alice}},
  {type:'visible-delta',revision:1,event:'active_scene_change',payload:{scene:'forest'}},
 ]);
 assert.deepEqual(cb.sent,[{type:'initial-snapshot',revision:0,payload:{viewer:bob}}]);
 assert.doesNotMatch(JSON.stringify([ca.sent,cb.sent]),/PRIVATE|SUPER|secret/);
 assert.equal(source.peerCount,2);
 source.close();
});
test('snapshot and revision are atomic for a newly joined or reconnecting peer',async()=>{
 const {source,register,commit}=setup();
 assert.equal(commit('active_scene_change',{scene:'bridge'}),true);
 const first=register(idA,alice);
 assert.deepEqual(first.snapshot(),{revision:0,payload:{scene:'bridge',viewer:alice}});
 const channel=new Channel();
 first.attachChannel(channel);
 await tick();
 assert.deepEqual(channel.sent[0],{type:'initial-snapshot',revision:0,payload:{scene:'bridge',viewer:alice}});
 assert.equal(commit('active_scene_change',{scene:'river'}),true);
 assert.equal(first.revision,1);
 first.close();
 const next=register(idB,alice);
 assert.deepEqual(next.snapshot(),{revision:0,payload:{scene:'river',viewer:alice}});
 assert.equal(first.revision,null);
 source.close();
});
test('invalid or unauthorized claims cannot attach or publish events',()=>{
 const {source,register}=setup();
 assert.equal(source.registerVerifiedPeer({peerId:idA,userId:gm,verifiedCampaignId:campaign}),null);
 assert.equal(source.registerVerifiedPeer({peerId:idA,userId:alice,verifiedCampaignId:'other'}),null);
 assert.equal(source.commit({authenticatedGmUserId:alice,event:'active_scene_change',payload:{scene:'forgery'}}),false);
 assert.equal(source.commit({authenticatedGmUserId:gm,event:'invented',payload:{}}),false);
 assert.ok(register(idA,alice));
 assert.equal(register(idA,bob),null);
 source.close();
});
test('failing visibility projection aborts entire GM state transition, no partial revisions',()=>{
 const {source,register,errors}=setup({
  projectVisibleEvent:({userId,event,payload})=>{
   if(userId===bob)throw Error('Visibility database unavailable');
   return {event,payload};
  },
 });
 const a=register(idA,alice),b=register(idB,bob);
 const ca=new Channel(),cb=new Channel();a.attachChannel(ca);b.attachChannel(cb);
 await tick();
 assert.equal(source.commit({authenticatedGmUserId:gm,event:'active_scene_change',payload:{scene:'private'}}),false);
 assert.equal(a.revision,0);assert.equal(b.revision,0);
 assert.equal(ca.sent.length,1);assert.equal(cb.sent.length,1);
 assert.equal(a.snapshot().payload.scene,'start');
 assert.equal(b.snapshot().payload.scene,'start');
 assert.deepEqual(errors,['Visibility database unavailable']);
 source.close();
});
test('async snapshot turn plus synchronous event publication does not lose or duplicate visible events',async()=>{
 const {source,register,commit}=setup();
 const a=register(idA,alice);
 const channel=new Channel();
 const stream=a.attachChannel(channel);
 assert.ok(stream);
 // While initial projection is pending on the microtask queue,
 // source and its revision clock move forward synchronously.
 assert.equal(commit('active_scene_change',{scene:'next'}),true);
 assert.equal(commit('active_scene_change',{scene:'last'}),true);
 await tick();await tick();
 assert.equal(stream.status,'ready');
 assert.equal(a.revision,2);
 // The atomically consistent later snapshot already includes revisions 1/2.
 assert.equal(channel.sent[0].revision<=2,true);
 assert.equal(channel.sent.at(-1).revision,2);
 assert.equal(new Set(channel.sent.map(x=>x.revision)).size,channel.sent.length);
 source.close();
});
test('closing a peer invalidates stream and no later event can deliver',async()=>{
 const {source,register,commit}=setup();
 const a=register(idA,alice),channel=new Channel();
 a.attachChannel(channel);await tick();
 const originalLength=channel.sent.length;
 a.close();
 assert.equal(channel.readyState,'closed');
 assert.equal(source.peerCount,0);
 assert.equal(commit('active_scene_change',{scene:'after revoke'}),true);
 assert.equal(channel.sent.length,originalLength);
 assert.throws(()=>a.snapshot(),/Revoked/);
 source.close();
});
test('reentrant GM commit is denied, keeping state and event order deterministic',()=>{
 let source;
 const base=setup({
  applyGmEvent:({state,payload})=>{
   assert.equal(source.commit({authenticatedGmUserId:gm,event:'active_scene_change',payload:{scene:'nested'}}),false);
   return {...state,scene:payload.scene};
  },
 });
 source=base.source;
 const a=base.register(idA,alice);
 assert.equal(base.commit('active_scene_change',{scene:'outer'}),true);
 assert.equal(a.snapshot().payload.scene,'outer');
 source.close();
});
test('player-scoped projected payloads cannot be modified after commit',async()=>{
 const {source,register,commit}=setup();
 const a=register(idA,alice);
 const c=new Channel();a.attachChannel(c);await tick();
 const payload={scene:'original'};
 assert.equal(commit('active_scene_change',payload),true);
 payload.scene='MUTATED';
 assert.equal(c.sent[1].payload.scene,'original');
 source.close();
});
