import test from 'node:test';
import assert from 'node:assert/strict';
import {createGmHostEventRouter} from '../src/ArubaGmHostEventRouter.mjs';
import {createVerifiedGmPeerBindings} from '../src/ArubaVerifiedGmPeerBindings.mjs';

const campaign='00000000-0000-4000-8000-000000000001';
const gm='00000000-0000-4000-8000-000000000002';
const player='00000000-0000-4000-8000-000000000003';
const peerId='00000000-0000-4000-8000-000000000004';
const proof={peerId,userId:player,campaignId:campaign};
class Channel{
 constructor(){this.readyState='open';this.handlers=new Map();this.sent=[];}
 addEventListener(name,fn){
  if(!this.handlers.has(name))this.handlers.set(name,new Set());
  this.handlers.get(name).add(fn);
 }
 removeEventListener(name,fn){this.handlers.get(name)?.delete(fn);}
 send(frame){if(this.readyState!=='open')throw Error('closed');this.sent.push(JSON.parse(frame));}
 close(){
  if(this.readyState==='closed')return;
  this.readyState='closed';
  for(const handler of [...(this.handlers.get('close')??[])])handler();
 }
}
const tick=()=>new Promise(resolve=>setImmediate(resolve));
function setup({loadSnapshot,projectVisibleSnapshot,onError=()=>{}}={}){
 const incoming=[];
 const router=createGmHostEventRouter({campaignId:campaign,gmUserId:gm,
  authorizeHostEvent:({event})=>event==='active_scene_change',
  authorizePlayerEvent:()=>false});
 const host=router.openVerifiedHost({authenticatedUserId:gm,
  receiveFromPlayer:frame=>incoming.push(frame)});
 const bindings=createVerifiedGmPeerBindings({router,campaignId:campaign,
  loadSnapshot,projectVisibleSnapshot,onError});
 bindings.onVerifiedPeer(proof);
 const channel=new Channel();
 assert.equal(bindings.attachChannel(peerId,channel),true);
 return {bindings,channel,host,incoming};
}
test('initial state precedes all queued GM updates and projection filters GM secrets',async()=>{
 let release;
 const loading=new Promise(resolve=>{release=resolve;});
 const {bindings,channel,host}=setup({
  loadSnapshot:async()=>loading,
  projectVisibleSnapshot:({snapshot,userId})=>{
   assert.equal(userId,player);
   return {scene:snapshot.scene}; // never return GM-only notes
  },
 });
 host.publish('active_scene_change',{id:'delta-1'});
 host.publish('active_scene_change',{id:'delta-2'});
 assert.deepEqual(channel.sent,[]);
 release({revision:7,payload:{scene:'visible',gmNotes:'NEVER-EXPOSE'}});
 await tick();await tick();
 assert.deepEqual(channel.sent,[
  {type:'initial-snapshot',revision:7,payload:{scene:'visible'}},
  {event:'active_scene_change',payload:{id:'delta-1'}},
  {event:'active_scene_change',payload:{id:'delta-2'}},
 ]);
 assert.doesNotMatch(JSON.stringify(channel.sent),/NEVER-EXPOSE/);
 host.publish('active_scene_change',{id:'delta-3'});
 assert.equal(channel.sent.at(-1).payload.id,'delta-3');
 bindings.close();
});
test('revoked peer cannot receive a late async snapshot or buffered delta',async()=>{
 let release;
 const source=new Promise(resolve=>{release=resolve;});
 const {bindings,channel,host}=setup({
  loadSnapshot:()=>source,projectVisibleSnapshot:({snapshot})=>snapshot,
 });
 host.publish('active_scene_change',{id:'private'});
 bindings.onPeerRevoked(proof);
 release({revision:2,payload:{scene:'old'}});
 await tick();await tick();
 assert.equal(channel.readyState,'closed');
 assert.deepEqual(channel.sent,[]);
 assert.equal(host.connectedPlayers,0);
 assert.equal(bindings.attachedCount,0);
});
test('projection failure and invalid revision fail closed instead of exposing data',async()=>{
 for(const raw of [{revision:-1,payload:{gmSecret:'private'}},{revision:1,payload:{gmSecret:'private'}}]){
  const errors=[];
  const {bindings,channel,host}=setup({
   loadSnapshot:async()=>raw,
   projectVisibleSnapshot:raw.revision===1?()=>null:({snapshot})=>snapshot,
   onError:error=>errors.push(error.message),
  });
  host.publish('active_scene_change',{id:'queued'});
  await tick();await tick();
  assert.equal(channel.readyState,'closed');
  assert.deepEqual(channel.sent,[]);
  assert.equal(host.connectedPlayers,0);
  assert.equal(bindings.attachedCount,0);
  assert.equal(errors.length,1);
  bindings.close();
 }
});
test('bounded pending queue closes instead of silently dropping events',async()=>{
 let release;
 const source=new Promise(resolve=>{release=resolve;});
 const {bindings,channel,host}=setup({
  loadSnapshot:()=>source,projectVisibleSnapshot:({snapshot})=>snapshot,
 });
 for(let i=0;i<130;i++)host.publish('active_scene_change',{id:i});
 assert.equal(channel.readyState,'closed');
 assert.equal(bindings.attachedCount,0);
 release({revision:1,payload:{scene:'late'}});
 await tick();await tick();
 assert.deepEqual(channel.sent,[]);
 bindings.close();
});
test('legacy bindings remain snapshot-free unless both trusted callbacks configured',()=>{
 const router=createGmHostEventRouter({campaignId:campaign,gmUserId:gm});
 assert.throws(()=>createVerifiedGmPeerBindings({router,campaignId:campaign,loadSnapshot:()=>({})}));
 assert.throws(()=>createVerifiedGmPeerBindings({router,campaignId:campaign,
  projectVisibleSnapshot:()=>({})}));
 const bindings=createVerifiedGmPeerBindings({router,campaignId:campaign});
 assert.equal(bindings.verifiedCount,0);
 bindings.close();
});
