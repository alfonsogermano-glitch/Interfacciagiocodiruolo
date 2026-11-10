import test from 'node:test';
import assert from 'node:assert/strict';
import {probeTurn,explainTurnProbe} from '../turn-preflight.mjs';
const config={iceTransportPolicy:'relay',iceServers:[{urls:['turn:test.invalid:3478'],username:'a',credential:'b'}]};
class FakePC{
 constructor(){this.iceGatheringState='new';}
 createDataChannel(){}
 async createOffer(){return {type:'offer',sdp:'v=0'};}
 async setLocalDescription(){
  this.iceGatheringState='gathering';
  queueMicrotask(()=>{
   this.onicecandidate?.({candidate:{candidate:'candidate:1 1 udp 123 203.0.113.1 40000 typ relay raddr 0.0.0.0 rport 0'}});
   this.iceGatheringState='complete';
   this.onicegatheringstatechange?.();
  });
 }
 close(){this.closed=true;}
}
class FakeNoRelay extends FakePC{
 async setLocalDescription(){
  this.iceGatheringState='complete';
  queueMicrotask(()=>{
   this.onicecandidateerror?.({errorCode:701,errorText:'secret redacted'});
   this.onicegatheringstatechange?.();
  });
 }
}
test('independent preflight detects relay candidate without logging candidate IP',async()=>{
 const r=await probeTurn(config,{RTCPeerConnectionClass:FakePC,timeoutMs:100});
 assert.equal(r.ok,true);
 assert.deepEqual(r.candidateTypes,['relay']);
 assert.equal(JSON.stringify(r).includes('203.0.113.1'),false);
});
test('missing relay returns a bounded, sanitized error',async()=>{
 const r=await probeTurn(config,{RTCPeerConnectionClass:FakeNoRelay,timeoutMs:100});
 assert.equal(r.ok,false);
 assert.deepEqual(r.errors,['701']);
 assert.match(explainTurnProbe(r),/nessun candidato relay/);
 assert.equal(JSON.stringify(r).includes('secret redacted'),false);
});
test('relay-only config is required',async()=>{
 await assert.rejects(probeTurn({iceServers:[]},{RTCPeerConnectionClass:FakePC}),/relay-only/);
});
