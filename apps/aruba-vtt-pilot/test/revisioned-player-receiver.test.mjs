import test from 'node:test';
import assert from 'node:assert/strict';
import {createArubaRevisionedPlayerReceiver} from '../src/ArubaRevisionedPlayerReceiver.mjs';
import {createArubaGmRevisionedCampaignSource} from '../src/ArubaGmRevisionedCampaignSource.mjs';

const campaign='00000000-0000-4000-8000-000000000001';
const gm='00000000-0000-4000-8000-000000000002';
const player='00000000-0000-4000-8000-000000000003';
const peer='00000000-0000-4000-8000-000000000004';
class Channel {
 constructor(){this.readyState='open';this.handlers=new Map();this.sent=[];}
 addEventListener(name,fn){if(!this.handlers.has(name))this.handlers.set(name,new Set());this.handlers.get(name).add(fn);}
 removeEventListener(name,fn){this.handlers.get(name)?.delete(fn);}
 send(data){
  if(this.readyState!=='open')throw Error('closed');
  try{this.sent.push(JSON.parse(data));}catch{this.sent.push(data);}
  for(const cb of [...(this.handlers.get('message')??[])])cb({data});
 }
 close(){
  if(this.readyState==='closed')return;
  this.readyState='closed';
  for(const cb of [...(this.handlers.get('close')??[])])cb();
 }
}
function make({applySnapshot=()=>true,applyDelta=()=>true}={}){
 const channel=new Channel(),errors=[],closures=[];
 const receiver=createArubaRevisionedPlayerReceiver({
  channel,applySnapshot,applyDelta,onError:e=>errors.push(e.message),
  onClosed:()=>closures.push(true),
 });
 const send=value=>channel.send(JSON.stringify(value));
 return {channel,receiver,errors,closures,send};
}
const snapshot=(revision=5,payload={scene:'forest'})=>({type:'initial-snapshot',revision,payload});
const delta=(revision=6,event='active_scene_change',payload={scene:'cave'})=>({type:'visible-delta',revision,event,payload});

test('verified GM snapshot must precede all deltas, and revisions increment once',()=>{
 const applied=[];
 const x=make({applySnapshot:f=>{applied.push(['snapshot',f]);return true;},
  applyDelta:f=>{applied.push(['delta',f]);return true;}});
 x.send(snapshot());
 x.send(delta());
 x.send(delta()); // identical retransmission must not apply twice
 assert.equal(x.receiver.revision,6);
 assert.equal(x.receiver.status,'ready');
 assert.deepEqual(applied.map(v=>v[0]),['snapshot','delta']);
 x.receiver.close();
});
test('a delta before initial state fails closed',()=>{
 const x=make();
 x.send(delta());
 assert.equal(x.channel.readyState,'closed');
 assert.equal(x.receiver.revision,null);
 assert.match(x.errors[0],/before initial/);
 assert.equal(x.closures.length,1);
});
test('revision gap, conflicting replay or duplicate snapshots are not silently accepted',()=>{
 const gap=make();
 gap.send(snapshot());
 gap.send(delta(8));
 assert.equal(gap.receiver.status,'closed');
 assert.match(gap.errors[0],/Missing or out-of-order/);
 const doubled=make();
 doubled.send(snapshot());
 doubled.send(snapshot());
 assert.equal(doubled.receiver.status,'closed');
 assert.match(doubled.errors[0],/Duplicate/);
});
test('unknown, malformed and oversized frames close without notifying original UI',()=>{
 for(const wire of [
  'not-json',
  JSON.stringify({type:'initial-snapshot',revision:0,payload:{},userId:'forged'}),
  JSON.stringify({type:'visible-delta',revision:0,event:'not-original',payload:{}}),
  'x'.repeat(61000),
  JSON.stringify({type:'initial-snapshot',revision:1.5,payload:{}}),
 ]){
  const x=make();
  x.channel.send(wire);
  assert.equal(x.receiver.status,'closed');
  assert.equal(x.errors.length,1);
 }
});
test('application rejection prevents partially advancing revision',()=>{
 const x=make({applySnapshot:()=>false});
 x.send(snapshot());
 assert.equal(x.receiver.revision,null);
 assert.equal(x.receiver.status,'closed');
 const y=make({applyDelta:()=>false});
 y.send(snapshot());
 y.send(delta());
 assert.equal(y.receiver.revision,5);
 assert.equal(y.receiver.status,'closed');
});
test('closing from inside original UI callback must not revive receiver',()=>{
 let x;
 x=make({applySnapshot:()=>{x.receiver.close();return true;}});
 x.send(snapshot());
 assert.equal(x.receiver.status,'closed');
 assert.equal(x.receiver.revision,null);
});
test('new verified channel starts fresh, no stale replay of previous state',()=>{
 const first=make();first.send(snapshot(9));first.receiver.close();
 const next=make();next.send(snapshot(0,{scene:'new-campaign-session'}));
 assert.equal(next.receiver.revision,0);
 assert.equal(first.receiver.status,'closed');
 next.receiver.close();
});
test('original-scene visibility and per-player source revisions reach receiver without leaking GM notes',async()=>{
 const channel=new Channel(),visible=[];
 const receiver=createArubaRevisionedPlayerReceiver({
  channel,applySnapshot:f=>{visible.push(f);return true;},
  applyDelta:f=>{visible.push(f);return true;},
 });
 const source=createArubaGmRevisionedCampaignSource({
  campaignId:campaign,gmUserId:gm,
  initialState:{scene:'start',gmNotes:'SECRET NEVER'},
  applyGmEvent:({state,event,payload})=>
   event==='active_scene_change'?{...state,scene:payload.scene}:{...state,gmNotes:payload.text},
  projectVisibleSnapshot:({state})=>({scene:state.scene}),
  projectVisibleEvent:({event,payload})=>
   event==='active_scene_change'?{event,payload:{scene:payload.scene}}:null,
 });
 const registered=source.registerVerifiedPeer({peerId:peer,userId:player,verifiedCampaignId:campaign});
 assert.ok(registered?.attachChannel(channel));
 await new Promise(resolve=>setImmediate(resolve));
 assert.equal(source.commit({authenticatedGmUserId:gm,event:'notes_change',payload:{text:'INVISIBLE'}}),true);
 assert.equal(source.commit({authenticatedGmUserId:gm,event:'active_scene_change',payload:{scene:'ruins'}}),true);
 assert.equal(receiver.revision,1);
 assert.equal(visible.length,2);
 assert.equal(visible[0].payload.scene,'start');
 assert.equal(visible[1].payload.scene,'ruins');
 assert.doesNotMatch(JSON.stringify(visible),/SECRET|INVISIBLE|gmNotes/);
 registered.close();source.close();
 assert.equal(receiver.status,'closed');
});
