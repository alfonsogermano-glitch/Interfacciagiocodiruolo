import test from 'node:test';
import assert from 'node:assert/strict';
import {createArubaRevisionedSnapshotStream} from '../src/ArubaRevisionedSnapshotStream.mjs';

class Channel{
 constructor(){this.readyState='open';this.callbacks=new Map();this.sent=[];}
 addEventListener(event,handler){if(!this.callbacks.has(event))this.callbacks.set(event,new Set());this.callbacks.get(event).add(handler);}
 removeEventListener(event,handler){this.callbacks.get(event)?.delete(handler);}
 send(value){if(this.readyState!=='open')throw Error('Closed');this.sent.push(JSON.parse(value));}
 close(){if(this.readyState==='closed')return;this.readyState='closed';for(const fn of [...(this.callbacks.get('close')??[])])fn();}
}
const tick=()=>new Promise(resolve=>setImmediate(resolve));
function create({loadSnapshot,projectVisibleSnapshot=({snapshot})=>({scene:snapshot.scene}),onError=()=>{}}={}){
 const channel=new Channel();
 const stream=createArubaRevisionedSnapshotStream({
  channel,campaignId:'c',userId:'u',peerId:'p',
  loadSnapshot:loadSnapshot??(async()=>({revision:5,payload:{scene:'visible',gmSecret:'HIDDEN'}})),
  projectVisibleSnapshot,onError,
 });
 return {channel,stream};
}
const delta=(revision,id='evt')=>({revision,event:'active_scene_change',payload:{id}});
test('snapshot overlap drops stale deltas; buffers out-of-order visible future events in order',async()=>{
 let resolve;
 const source=new Promise(r=>{resolve=r;});
 const {channel,stream}=create({loadSnapshot:()=>source});
 const begin=stream.begin();
 assert.equal(stream.publishVisibleDelta(delta(7,'seven')),true);
 assert.equal(stream.publishVisibleDelta(delta(4,'included')),true);
 assert.equal(stream.publishVisibleDelta(delta(6,'six')),true);
 assert.equal(stream.publishVisibleDelta(delta(5,'included-again')),true);
 assert.deepEqual(channel.sent,[]);
 resolve({revision:5,payload:{scene:'visible',gmSecret:'NEVER'}});
 assert.equal(await begin,true);
 assert.deepEqual(channel.sent,[
  {type:'initial-snapshot',revision:5,payload:{scene:'visible'}},
  {type:'visible-delta',revision:6,event:'active_scene_change',payload:{id:'six'}},
  {type:'visible-delta',revision:7,event:'active_scene_change',payload:{id:'seven'}},
 ]);
 assert.doesNotMatch(JSON.stringify(channel.sent),/NEVER|included/);
 assert.equal(stream.revision,7);
 stream.close();
});
test('gap during buffering fails before leaking incomplete snapshot',async()=>{
 const errors=[];
 const {stream,channel}=create({onError:e=>errors.push(e.message)});
 stream.publishVisibleDelta(delta(7));
 assert.equal(await stream.begin(),false);
 assert.equal(channel.readyState,'closed');
 assert.deepEqual(channel.sent,[]);
 assert.match(errors[0],/Gap/);
});
test('live gap closes instead of skipping missing delta, even after snapshot was delivered',async()=>{
 const {stream,channel}=create();
 assert.equal(await stream.begin(),true);
 assert.equal(stream.publishVisibleDelta(delta(6)),true);
 assert.equal(stream.publishVisibleDelta(delta(8)),false);
 assert.equal(channel.readyState,'closed');
 assert.equal(stream.revision,6);
 assert.equal(channel.sent.length,2);
});
test('identical buffered duplicate is idempotent but conflicting duplicate fails closed',async()=>{
 let resolve;
 const p=new Promise(r=>{resolve=r;});
 const {stream,channel}=create({loadSnapshot:()=>p});
 const begin=stream.begin();
 assert.equal(stream.publishVisibleDelta(delta(6,'one')),true);
 assert.equal(stream.publishVisibleDelta(delta(6,'one')),true);
 assert.equal(stream.bufferedEvents,1);
 assert.equal(stream.publishVisibleDelta(delta(6,'DIFFERENT')),false);
 resolve({revision:5,payload:{scene:'visible'}});
 assert.equal(await begin,false);
 assert.deepEqual(channel.sent,[]);
});
test('revocation during asynchronous projection prevents sending data',async()=>{
 let resolve;
 const p=new Promise(r=>{resolve=r;});
 const {stream,channel}=create({projectVisibleSnapshot:()=>p});
 const begin=stream.begin();
 await tick();
 stream.publishVisibleDelta(delta(6));
 stream.close();
 resolve({scene:'not-allowed-anymore'});
 assert.equal(await begin,false);
 assert.deepEqual(channel.sent,[]);
});
test('bounded buffering fails closed rather than losing events',()=>{
 const {stream,channel}=create();
 for(let n=6;n<=133;n++)assert.equal(stream.publishVisibleDelta(delta(n)),true);
 assert.equal(stream.publishVisibleDelta(delta(134)),false);
 assert.equal(channel.readyState,'closed');
});
test('initial snapshot fails closed without explicit player projection',async()=>{
 const {channel,stream}=create({projectVisibleSnapshot:()=>null});
 assert.equal(await stream.begin(),false);
 assert.deepEqual(channel.sent,[]);
 assert.equal(channel.readyState,'closed');
});
test('concurrent begin uses only one source load',async()=>{
 let loads=0;
 const {stream,channel}=create({loadSnapshot:async()=>{loads++;return {revision:0,payload:{scene:'one'}};}});
 assert.deepEqual(await Promise.all([stream.begin(),stream.begin()]),[true,true]);
 assert.equal(loads,1);
 assert.equal(channel.sent.length,1);
 stream.close();
});
test('synchronous channel callbacks cannot reorder reentrant visible deltas',async()=>{
 const {stream,channel}=create();
 assert.equal(await stream.begin(),true);
 const original=channel.send.bind(channel);
 channel.send=(wire)=>{
  original(wire);
  const frame=JSON.parse(wire);
  if(frame.type==='visible-delta'&&frame.revision===6)
   assert.equal(stream.publishVisibleDelta(delta(7,'nested')),true);
 };
 assert.equal(stream.publishVisibleDelta(delta(6,'first')),true);
 assert.deepEqual(channel.sent.map(f=>f.revision),[5,6,7]);
 stream.close();
});
