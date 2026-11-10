import test from 'node:test';
import assert from 'node:assert/strict';
import { createSignalingHub } from './signaling-hub.mjs';

async function setup(t,options={}) {
 const hub=createSignalingHub(options);
 const url=await hub.start();
 t.after(()=>hub.close());
 async function call(path,body={},token=null){
  const result=await fetch(url+'/v1/'+path,{method:'POST',headers:{
   'content-type':'application/json',...(token?{authorization:'Bearer '+token}:{})
  },body:JSON.stringify(body)});
  return {status:result.status,data:await result.json()};
 }
 return {hub,call};
}
test('GM and two players exchange signaling without storing gameplay content',async t=>{
 const {hub,call}=await setup(t);
 const gm=(await call('create')).data;
 const alice=(await call('join',{room:gm.room})).data;
 const bob=(await call('join',{room:gm.room})).data;
 assert.equal(hub.activeRooms,1);
 assert.equal((await call('send',{room:gm.room,to:'host',kind:'offer',description:'alice-offer'},alice.token)).status,200);
 const inbox=(await call('poll',{room:gm.room,after:0},gm.token)).data.messages;
 assert.equal(inbox.length,1);
 assert.equal(inbox[0].description,'alice-offer');
 assert.equal(inbox[0].from,alice.peerId);
 assert.deepEqual((await call('poll',{room:gm.room,after:0},bob.token)).data.messages,[]);
 assert.equal((await call('send',{room:gm.room,to:alice.peerId,kind:'answer',description:'answer-A'},gm.token)).status,200);
 assert.equal((await call('poll',{room:gm.room,after:0},alice.token)).data.messages[0].description,'answer-A');
 assert.equal((await call('poll',{room:gm.room,after:inbox[0].id},gm.token)).data.messages.length,0);
});
test('reject unauthorized, peer spoofing and game payload',async t=>{
 const {call}=await setup(t);const gm=(await call('create')).data;
 const a=(await call('join',{room:gm.room})).data;
 const b=(await call('join',{room:gm.room})).data;
 assert.equal((await call('poll',{room:gm.room,after:0})).status,403);
 assert.equal((await call('send',{room:gm.room,to:b.peerId,kind:'offer',description:'bad'},a.token)).status,400);
 assert.equal((await call('send',{room:gm.room,to:'host',kind:'game_state',description:'private-note'},a.token)).status,400);
 assert.equal((await call('send',{room:gm.room,to:'host',kind:'answer',description:'invalid'},a.token)).status,400);
 assert.equal((await call('send',{room:gm.room,to:a.peerId,kind:'offer',description:'invalid'},gm.token)).status,400);
 assert.equal((await call('join',{room:'BAD'})).status,404);
});
test('rooms expire in memory and leave revokes access',async t=>{
 let time=10;
 const {hub,call}=await setup(t,{now:()=>time});
 const gm=(await call('create')).data;
 const p=(await call('join',{room:gm.room})).data;
 assert.equal((await call('leave',{room:gm.room},p.token)).status,200);
 assert.equal((await call('poll',{room:gm.room,after:0},p.token)).status,403);
 time+=31*60_000;
 assert.equal(hub.activeRooms,0);
 assert.equal((await call('poll',{room:gm.room,after:0},gm.token)).status,403);
});

test('room codes are always human-safe, unique, and available to players',async t=>{
 const {call}=await setup(t);
 const codes=new Set();
 for(let i=0;i<48;i++){
  const response=await call('create');
  assert.equal(response.status,201);
  const code=response.data.room;
  assert.match(code,/^[A-HJ-NP-Z2-9]{8}$/);
  assert.equal(codes.has(code),false);
  codes.add(code);
  const joined=await call('join',{room:code});
  assert.equal(joined.status,200);
 }
});
