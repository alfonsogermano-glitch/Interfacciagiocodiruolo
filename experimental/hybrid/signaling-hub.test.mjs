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
 assert.equal((await call('send',{room:gm.room,to:'host',kind:'offer',description:'blocked'},alice.token)).status,403);
 const pending=(await call('pending',{room:gm.room},gm.token)).data.requests;
 assert.equal(pending.length,2);
 for(const p of [alice,bob])assert.equal((await call('decision',{room:gm.room,peerId:p.peerId,approve:true},gm.token)).status,200);
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
 for(const p of [a,b])await call('decision',{room:gm.room,peerId:p.peerId,approve:true},gm.token);
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

test('CORS only allows the explicit browser preview origin',async t=>{
 const origin='https://alfonsogermano-glitch.github.io';
 const {hub}=await setup(t,{allowedOrigins:[origin]});
 assert.equal(hub.activeRooms,0);
});
test('browser preflights are allowlisted, never wildcard, and deny unknown origins',async t=>{
 const origin='https://alfonsogermano-glitch.github.io';
 const hub=createSignalingHub({allowedOrigins:[origin]});
 const url=await hub.start();t.after(()=>hub.close());
 const allowed=await fetch(url+'/v1/create',{method:'OPTIONS',headers:{origin,'access-control-request-method':'POST','access-control-request-headers':'authorization,content-type'}});
 assert.equal(allowed.status,204);
 assert.equal(allowed.headers.get('access-control-allow-origin'),origin);
 const rejected=await fetch(url+'/v1/create',{method:'POST',headers:{origin:'https://attacker.example','content-type':'application/json'},body:'{}'});
 assert.equal(rejected.status,403);
 assert.equal(rejected.headers.get('access-control-allow-origin'),null);
 const ok=await fetch(url+'/v1/create',{method:'POST',headers:{origin,'content-type':'application/json'},body:'{}'});
 assert.equal(ok.status,201);
});
test('acknowledged signaling messages are removed from memory, while future messages survive',async t=>{
 const {call}=await setup(t);
 const host=(await call('create')).data;
 const player=(await call('join',{room:host.room})).data;
 assert.equal((await call('decision',{room:host.room,peerId:player.peerId,approve:true},host.token)).status,200);
 await call('send',{room:host.room,to:'host',kind:'offer',description:'old'},player.token);
 const first=(await call('poll',{room:host.room,after:0},host.token)).data.messages[0];
 assert.equal(first.description,'old');
 assert.deepEqual((await call('poll',{room:host.room,after:first.id},host.token)).data.messages,[]);
 await call('send',{room:host.room,to:'host',kind:'offer',description:'new'},player.token);
 const second=(await call('poll',{room:host.room,after:first.id},host.token)).data.messages;
 assert.equal(second.length,1);
 assert.equal(second[0].description,'new');
 assert.equal((await call('poll',{room:host.room,after:Number.MAX_SAFE_INTEGER},host.token)).status,400);
});
test('unbounded room creation is rejected',async t=>{
 const {call}=await setup(t);
 for(let i=0;i<128;i++)assert.equal((await call('create')).status,201);
 assert.equal((await call('create')).status,429);
});

test('GM approval gate cannot be bypassed, rejection is observable and revokes ability to signal',async t=>{
 const {call}=await setup(t);
 const gm=(await call('create')).data;
 const pending=(await call('join',{room:gm.room,name:'Alice'})).data;
 assert.equal(pending.status,'pending');
 assert.equal((await call('status',{room:gm.room},pending.token)).data.status,'pending');
 assert.equal((await call('send',{room:gm.room,to:'host',kind:'offer',description:'unauthorized'},pending.token)).status,403);
 assert.equal((await call('poll',{room:gm.room,after:0},pending.token)).status,403);
 assert.equal((await call('decision',{room:gm.room,peerId:pending.peerId,approve:true},pending.token)).status,403);
 assert.deepEqual((await call('pending',{room:gm.room},gm.token)).data.requests,[{peerId:pending.peerId,name:'Alice'}]);
 assert.equal((await call('decision',{room:gm.room,peerId:pending.peerId,approve:false},gm.token)).status,200);
 assert.equal((await call('status',{room:gm.room},pending.token)).data.status,'rejected');
 assert.equal((await call('send',{room:gm.room,to:'host',kind:'offer',description:'stillblocked'},pending.token)).status,403);
 assert.equal((await call('decision',{room:gm.room,peerId:pending.peerId,approve:true},gm.token)).status,400);
 const allowed=(await call('join',{room:gm.room})).data;
 assert.equal((await call('decision',{room:gm.room,peerId:allowed.peerId,approve:true},gm.token)).status,200);
 assert.equal((await call('status',{room:gm.room},allowed.token)).data.status,'approved');
 assert.equal((await call('send',{room:gm.room,to:'host',kind:'offer',description:'accepted'},allowed.token)).status,200);
});
