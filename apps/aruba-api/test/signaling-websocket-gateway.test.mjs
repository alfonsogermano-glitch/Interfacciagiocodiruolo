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
async function setup(){
 const revoked=new Set(),server=createServer((_req,res)=>res.end('Not found'));
 const identity={async verify({sessionToken,campaignId,connectionRole}){
  if(revoked.has(sessionToken)||campaignId!==campaign)throw Error('Denied');
  if(connectionRole==='host'&&sessionToken===hostToken)
   return {userId:owner,campaignId,role:'gm'};
  if(connectionRole==='player'&&sessionToken===playerToken)
   return {userId:player,campaignId,role:'player'};
  throw Error('Denied');
 }};
 const gateway=createSignalingWebSocketGateway({server,origin,identity});
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
  peer.send(JSON.stringify({type:'signal',kind:'offer',payload:{sdp:'offer'}}));
  assert.deepEqual(await toHost,{type:'signal',kind:'offer',
   peerId:member.peerId,payload:{sdp:'offer'}});
  const toPlayer=next(peer);
  host.send(JSON.stringify({type:'signal',kind:'answer',
   targetPeerId:member.peerId,payload:{sdp:'answer'}}));
  assert.deepEqual(await toPlayer,{type:'signal',kind:'answer',payload:{sdp:'answer'}});
 }finally{await s.close();}
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
  second.send(JSON.stringify({type:'signal',kind:'ice',payload:{candidate:'x'}}));
  await revoked;
 }finally{await s.close();}
});
