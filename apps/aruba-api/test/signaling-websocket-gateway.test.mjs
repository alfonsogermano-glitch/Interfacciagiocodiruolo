import test from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {once} from 'node:events';
import {WebSocket} from 'ws';
import {createSignalingWebSocketGateway} from '../src/signaling-websocket-gateway.mjs';
const campaign='00000000-0000-4000-8000-000000000001';
const owner='00000000-0000-4000-8000-000000000002';
const player='00000000-0000-4000-8000-000000000003';
const origin='https://staging.hollowgate.quest';
const hostToken='A'.repeat(43),playerToken='B'.repeat(43);
const next=ws=>new Promise((resolve,reject)=>{
 const ok=raw=>{cleanup();resolve(JSON.parse(raw.toString()));};
 const bad=()=>{cleanup();reject(Error('Socket closed'));};
 function cleanup(){ws.off('message',ok);ws.off('close',bad);}
 ws.on('message',ok);ws.on('close',bad);
});
async function setup(options={}){
 const revoked=new Set(),server=createServer((_req,res)=>res.end('Not found'));
 const identity={async verify({sessionToken,campaignId,connectionRole}){
  await options.beforeVerify?.({sessionToken,connectionRole});
  if(revoked.has(sessionToken)||campaignId!==campaign)throw Error('Denied');
  if(connectionRole==='host'&&sessionToken===hostToken)
   return {userId:owner,campaignId,role:'gm'};
  if(connectionRole==='player'&&sessionToken===playerToken)
   return {userId:player,campaignId,role:'player'};
  throw Error('Denied');
 }};
 const {beforeVerify,...gatewayOptions}=options;
 const gateway=createSignalingWebSocketGateway({server,origin,identity,...gatewayOptions});
 server.listen(0,'127.0.0.1');await once(server,'listening');
 const port=server.address().port,sockets=[];
 const url=(role)=>'ws://127.0.0.1:'+port+'/vtt/signaling?campaignId='+campaign+'&role='+role;
 async function connect(role,token){
  const ws=new WebSocket(url(role),{headers:{Origin:origin,
   Cookie:'__Host-hg_session='+token}});
  sockets.push(ws);
  const ready=next(ws);
  await once(ws,'open');
  return {ws,ready};
 }
 async function close(){
  gateway.close();for(const ws of sockets)ws.terminate();
  await new Promise(resolve=>server.close(resolve));
 }
 return {connect,close,revoked,url,port};
}
test('authenticated host and player exchange only SDP/ICE signaling',async()=>{
 const s=await setup();
 try{
  const {ws:host,ready:hw}=await s.connect('host',hostToken);
  assert.equal((await hw).type,'ready');
  const joined=next(host);
  const {ws:peer,ready:pw}=await s.connect('player',playerToken);
  assert.equal((await pw).type,'ready');
  const member=await joined;
  assert.equal(member.type,'peer-joined');
  const toHost=next(host);
  peer.send(JSON.stringify({type:'signal',kind:'answer',payload:{sdp:'answer'}}));
  assert.deepEqual(await toHost,{type:'signal',kind:'answer',
   peerId:member.peerId,payload:{sdp:'answer'}});
  const toPlayer=next(peer);
  host.send(JSON.stringify({type:'signal',kind:'offer',
   targetPeerId:member.peerId,payload:{sdp:'offer'}}));
  assert.deepEqual(await toPlayer,{type:'signal',kind:'offer',payload:{sdp:'offer'}});
 }finally{await s.close();}
});
test('a second host cannot replace an active room or disconnect its players',async()=>{
 const s=await setup();
 try{
  const {ws:host,ready:hw}=await s.connect('host',hostToken);await hw;
  const joined=next(host);
  const {ws:peer,ready:pw}=await s.connect('player',playerToken);
  await pw;const member=await joined;
  const rejected=await new Promise(resolve=>{
   const duplicate=new WebSocket(s.url('host'),{headers:{Origin:origin,
    Cookie:'__Host-hg_session='+hostToken}});
   duplicate.on('unexpected-response',(_request,response)=>resolve(response.statusCode));
   duplicate.on('open',()=>duplicate.once('close',()=>resolve(1008)));
   duplicate.on('error',()=>{});
  });
  assert.ok([403,1008].includes(rejected));
  const toHost=next(host);
  peer.send(JSON.stringify({type:'signal',kind:'answer',payload:{sdp:'still-active'}}));
  assert.deepEqual(await toHost,{type:'signal',kind:'answer',
   peerId:member.peerId,payload:{sdp:'still-active'}});
 }finally{await s.close();}
});
test('player upgrade cannot resurrect a room after its host disconnects during verification',async()=>{
 let release,entered;
 const waiting=new Promise(resolve=>{entered=resolve;});
 const blocked=new Promise(resolve=>{release=resolve;});
 const s=await setup({beforeVerify:async({connectionRole})=>{
  if(connectionRole==='player'){entered();await blocked;}
 }});
 try{
  const {ws:host,ready:hw}=await s.connect('host',hostToken);await hw;
  const peer=new WebSocket(s.url('player'),{headers:{Origin:origin,
   Cookie:'__Host-hg_session='+playerToken}});
  await waiting;
  const closed=once(host,'close');host.close();await closed;
  release();
  const outcome=await new Promise(resolve=>{
   peer.once('unexpected-response',(_request,response)=>resolve(response.statusCode));
   peer.once('open',()=>peer.once('close',code=>resolve(code)));
   peer.once('error',()=>{});
  });
  assert.ok([403,1008].includes(outcome));
 }finally{release?.();await s.close();}
});
test('wrong Origin and absent cookie are rejected before upgrade',async()=>{
 const s=await setup();
 try{
  const attempt=headers=>new Promise(resolve=>{
   const ws=new WebSocket(s.url('host'),{headers});
   ws.on('unexpected-response',(_request,response)=>resolve(response.statusCode));
   ws.on('error',()=>{});
  });
  assert.equal(await attempt({Origin:'https://evil.invalid',
   Cookie:'__Host-hg_session='+hostToken}),403);
  assert.equal(await attempt({Origin:origin}),401);
 }finally{await s.close();}
});
test('application data is refused and revoked player cannot signal',async()=>{
 const s=await setup();
 try{
  const {ws:host,ready:hw}=await s.connect('host',hostToken);await hw;
  const first=next(host);
  const {ws:peer,ready:pw}=await s.connect('player',playerToken);
  await pw;await first;
  const closed=once(peer,'close');
  peer.send(JSON.stringify({type:'chat_message',payload:{text:'secret'}}));
  await closed;
  const joined=next(host);
  const {ws:second,ready:sw}=await s.connect('player',playerToken);
  await sw;await joined;
  s.revoked.add(playerToken);
  const revoked=once(second,'close');
  second.send(JSON.stringify({type:'signal',kind:'ice',payload:{candidate:{candidate:'candidate:1 1 udp 1 127.0.0.1 10000 typ host'}}}));
  await revoked;
 }finally{await s.close();}
});

test('signaling rejects disguised game data, malformed SDP and ICE objects',async()=>{
 const invalid=[
  {type:'signal',kind:'ice',payload:{candidate:{candidate:'ice',chat_message:'secret'}}},
  {type:'signal',kind:'ice',payload:{candidate:{candidate:123}}},
  {type:'signal',kind:'ice',payload:{candidate:{candidate:'x',sdpMLineIndex:-1}}},
  {type:'signal',kind:'offer',payload:{sdp:'offer',notes_change:{private:true}}},
  {type:'signal',kind:'answer',payload:{sdp:123}},
 ];
 const s=await setup();
 try{
  const {ws:host,ready:hw}=await s.connect('host',hostToken);await hw;
  for(const payload of invalid){
   const waiting=next(host);
   const {ws:peer,ready:pw}=await s.connect('player',playerToken);
   await pw;await waiting;
   const ended=once(peer,'close');
   peer.send(JSON.stringify(payload));
   const [code]=await ended;
   assert.equal(code,1008);
  }
 }finally{await s.close();}
});
test('host cannot send player-only answers and player cannot send host-only offers',async()=>{
 const s=await setup();
 try{
  const {ws:host,ready:hw}=await s.connect('host',hostToken);await hw;
  const waiting=next(host);
  const {ws:peer,ready:pw}=await s.connect('player',playerToken);
  await pw;
  const joined=await waiting;
  const hostClosed=once(host,'close');
  host.send(JSON.stringify({type:'signal',kind:'answer',targetPeerId:joined.peerId,
   payload:{sdp:'offer'}}));
  assert.equal((await hostClosed)[0],1008);
 }finally{await s.close();}
});

const waitFor=async(check,timeout=2500)=>{
 const until=Date.now()+timeout;
 while(Date.now()<until){
  if(check())return;
  await new Promise(resolve=>setTimeout(resolve,15));
 }
 throw Error('Timed out waiting for membership revocation');
};
test('server-proven player identity is sent only to the verified GM',async()=>{
 const s=await setup({revalidateIntervalMs:50});
 try{
  const {ws:host,ready:hw}=await s.connect('host',hostToken);
  await hw;
  const joined=next(host);
  const {ws:peer,ready:pw}=await s.connect('player',playerToken);
  await pw;
  const result=await joined;
  assert.deepEqual(result,{
   type:'peer-joined',peerId:result.peerId,userId:player,campaignId:campaign,
  });
  assert.match(result.peerId,/^[0-9a-f-]{36}$/);
  peer.terminate();
 }finally{await s.close();}
});
test('idle revoked player is disconnected and GM informed without any signaling traffic',async()=>{
 const s=await setup({revalidateIntervalMs:20});
 try{
  const {ws:host,ready:hw}=await s.connect('host',hostToken);await hw;
  const joined=next(host);
  const {ws:peer,ready:pw}=await s.connect('player',playerToken);
  await pw;
  const membership=await joined;
  const left=next(host);
  let code=null;
  peer.once('close',value=>{code=value;});
  s.revoked.add(playerToken);
  const result=await left;
  assert.deepEqual(result,{type:'peer-left',peerId:membership.peerId,campaignId:campaign});
  await waitFor(()=>code!==null);
  assert.equal(code,1008);
 }finally{await s.close();}
});
test('idle revoked GM closes its room, including every player WebRTC signaling socket',async()=>{
 const s=await setup({revalidateIntervalMs:20});
 try{
  const {ws:host,ready:hw}=await s.connect('host',hostToken);await hw;
  const joined=next(host);
  const {ws:peer,ready:pw}=await s.connect('player',playerToken);await pw;await joined;
  let hostClosed=false,peerClosed=false;
  host.once('close',()=>{hostClosed=true;});
  peer.once('close',()=>{peerClosed=true;});
  s.revoked.add(hostToken);
  await waitFor(()=>hostClosed&&peerClosed);
 }finally{await s.close();}
});
test('invalid heartbeat intervals fail closed',()=>{
 const server=createServer();
 assert.throws(()=>createSignalingWebSocketGateway({
  server,origin,identity:{verify:async()=>{}},revalidateIntervalMs:0,
 }));
 assert.throws(()=>createSignalingWebSocketGateway({
  server,origin,identity:{verify:async()=>{}},revalidateIntervalMs:Infinity,
 }));
 server.close();
});
