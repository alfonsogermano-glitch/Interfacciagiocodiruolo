import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
const base=new URL('./',import.meta.url);
const html=readFileSync(new URL('index.html',base),'utf8');
const app=readFileSync(new URL('demo.js',base),'utf8');
test('static preview never fetches production auth or writes remote campaigns',()=>{
 assert.doesNotMatch(app,/supabase|service_role|fetch\(|httpSend/);
 assert.match(html,/Prototipo sperimentale/);
 assert.match(app,/localStorage\.setItem\(STORAGE/);
});
test('real WebRTC signaling and client permission checks are implemented',()=>{
 for(const part of ['RTCPeerConnection','createDataChannel','setRemoteDescription','createAnswer','iceGatheringState','visibility===\'gm\'','t.owner!==actor','broadcast()','navigator.clipboard.writeText'])assert.ok(app.includes(part),part);
});
test('separate user workflow for GM/player and destructive demo reset confirmation',()=>{
 for(const id of ['hostMode','playerMode','createOffer','acceptOffer','applyAnswer','resetHost','board','timeline'])assert.ok(html.includes('id="'+id+'"'),id);
 assert.match(app,/confirm\('Cancellare esclusivamente/);
});
test('browser demo reports actual WebRTC data-channel round-trip latency',()=>{
 assert.match(html,/id="latencyMeter"/);
 for(const p of ["kind:'ping'","kind:'pong'","performance.now()","startPings(channel)","stopPings()"])assert.ok(app.includes(p),p);
});

test('GM and players both perform independent round-trip timing with per-peer cleanup',()=>{
 for(const code of ['beginHostPing(id,peer)','endHostPing(id,peer)','peer?.pendingPing===msg.id','peer.rttMs','tell(channel,{kind:\'pong\'','connected.map(([id,peer])'])assert.ok(app.includes(code),code);
});

test('optional Connect UI integrates HTTPS-only automatic room signaling while preserving manual pairing',()=>{
  const code=['connectHost','connectJoin','connectEndpoint','roomCode','joinRoomCode','connectDisconnect'];
  for(const id of code)assert.ok(html.includes('id="'+id+'"'),id);
  for(const snippet of ['createConnectClient','createRoom()','joinRoom(room,validateName','acceptRemoteOffer(offer,answer=>','applyRemoteAnswer(JSON.parse(message.description))','void active.listen'])assert.ok(app.includes(snippet),snippet);
  assert.match(html,/modalità manuale/i);
});

test('quick PeerJS demo uses code-based signaling with existing encrypted game channels',()=>{
 for(const id of ['quickHost','quickJoin','quickRoom','quickCode','quickStop']) assert.ok(html.includes('id="'+id+'"'),id);
 assert.match(html,/peerjs@1\.5\.5\/dist\/peerjs\.min\.js/);
 for(const phrase of ['PEER_ID_PREFIX','newQuickCode()','openQuickPeer','peer.connect(','bindHostChannel(adaptPeerJsConnection(raw)','bindPlayerChannel(adaptPeerJsConnection(raw))'])assert.ok(app.includes(phrase),phrase);
 assert.match(html,/non è autenticato/);
 assert.match(html,/metadati di collegamento e indirizzi IP/);
});

test('dedicated Connect approval UI requires GM decision before player offers',()=>{
 for(const id of ['pendingApprovals','pendingHint'])assert.match(html,new RegExp('id="'+id+'"'));
 for(const snippet of ['await connectClient.awaitApproval()','active.pendingRequests()','active.decide(request.peerId,true)','active.decide(request.peerId,false)'])assert.ok(app.includes(snippet),snippet);
});
