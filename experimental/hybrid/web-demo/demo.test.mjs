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
 for(const phrase of ['PEER_ID_PREFIX','newQuickCode()','openQuickPeer','quickPeer.connect(','bindHostChannel(adapter,id','bindPlayerChannel(adapter)'])assert.ok(app.includes(phrase),phrase);
 assert.match(html,/non è autenticato/);
 assert.match(html,/metadati di collegamento e indirizzi IP/);
});

test('dedicated Connect approval UI requires GM decision before player offers',()=>{
 for(const id of ['pendingApprovals','pendingHint'])assert.match(html,new RegExp('id="'+id+'"'));
 for(const snippet of ['await connectClient.awaitApproval()','active.pendingRequests()','active.decide(request.peerId,true)','active.decide(request.peerId,false)'])assert.ok(app.includes(snippet),snippet);
});

test('quick PeerJS requires explicit GM approval before snapshot and token assignment',()=>{
 assert.match(html,/id="quickApprovals"/);
 assert.match(html,/id="quickApprovalInfo"/);
 for(const part of ['pendingPeerJs.set(id,','requireApproval:true','completeHostJoin(request.id,','request.channel.close()','textContent=\'Autorizza\'','textContent=\'Rifiuta\''])assert.ok(app.includes(part),part);
 assert.ok(app.indexOf('if(requireApproval)')<app.indexOf('completeHostJoin(id,name,c,conn);'));
});

test('quick reconnect is bounded, reuses room code and never skips GM approval',()=>{
 assert.match(html,/id="quickReconnect"/);
 for(const p of ["scheduleQuickRetry()","quickRetryAttempt","retryDelay(","quickGeneration","quickStopRequested","sessionStorage.getItem(QUICK_SESSION)","sessionStorage.setItem(QUICK_SESSION","connectQuickPlayer()","requireApproval:true"])
  assert.ok(app.includes(p),p);
});

test('quick reconnect preserves approved token but still requires new GM authorization',()=>{
 for(const p of ['resumeKey:quickRole===\'player\'?quickResumeKey:null','request.setAssignedId?.(assigned)','previous=Object.entries(hostState.members).find','completeHostJoin(request.id,request.name,request.channel,request.conn,request.resumeKey)','if(peers.get(id)?.channel===c)','const connectionTimeout=setTimeout']) assert.ok(app.includes(p),p);
});

test('PeerJS adapter validates incoming already-open channels without missing GM authorization',()=>{
 assert.match(app,/import \{ adaptPeerJsConnection \} from '.\/peerjs-adapter.mjs'/);
 assert.match(app,/bindHostChannel\(adapter,id/);
});

test('GM resends snapshot until client ACK and supports explicit resync',()=>{
 for(const snippet of ['kind:\'snapshot-ack\'','msg.kind===\'sync-request\'','awaitSnapshotAck(assigned)','sendFreshSnapshot(id)','SNAPSHOT_ACK_RETRIES','peer.syncAcked=true'])
  assert.ok(app.includes(snippet),snippet);
});

test('mobile player explicitly requests state after approval and retries without bypassing GM checks',()=>{
 assert.match(html,/id="quickSync"/);
 for(const piece of ["startSnapshotRecovery(c)","requestPlayerSnapshot(c,'autorizzazione')","kind:'sync-request'","stopSnapshotRecovery()","peers.get(id)?.channel===c","Errore sincronizzazione"])
  assert.ok(app.includes(piece),piece);
});

test('mobile quick join hides manual SDP controls and scrolls to first game snapshot',()=>{
 assert.match(html,/id="quickDiagnostics"/);
 for(const token of ["$('playerSetup').hidden=true", "$('hostSetup').hidden=true", "requestAnimationFrame(()=>$('session').scrollIntoView", "quickDiag('Snapshot ricevuto", "quickDiag('Campo ricevuto"])
  assert.ok(app.includes(token),token);
 assert.match(html,/demo\.js\?v=rtt-diagnostics-20261110/);
});

test('snapshots are transferred through small bounded packets and reassembled before board render',()=>{
 for(const phrase of ["snapshotPackets(snapshot(id),crypto.randomUUID())","for(const packet of packets)tell(peer.channel,packet)","createSnapshotAssembler(","applyPlayerSnapshot(state,c)","assembler.accept(m)"])
  assert.ok(app.includes(phrase),phrase);
});

test('RTT diagnostics report baseline median, spikes and selected ICE route for actual data channels',()=>{
 for(const token of ['playerRtt.add(next)','peer.rttMeter?.add(elapsed)','makeRttMeter()','describeRtt(playerRtt.summary())','classifySelectedPair(report)','peerConnection:raw.peerConnection'])
  assert.ok(app.includes(token),token);
});
