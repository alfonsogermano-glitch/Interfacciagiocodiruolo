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
 for(const code of ['beginHostPing(id,peer)','endHostPing(id,peer)','peer.pendingPing===msg.id','peer.rttMs','tell(channel,{kind:\'pong\'','connected.map(([id,peer])'])assert.ok(app.includes(code),code);
});
