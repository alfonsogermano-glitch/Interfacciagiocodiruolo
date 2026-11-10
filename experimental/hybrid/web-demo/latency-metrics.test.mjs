import test from 'node:test';
import assert from 'node:assert/strict';
import {makeRttMeter,describeRtt,classifySelectedPair} from './latency-metrics.mjs';
test('RTT reports baseline and spikes rather than a misleading single smoothed number',()=>{
 const meter=makeRttMeter(4);
 for(const x of [38,45,300,41,55])meter.add(x);
 const s=meter.summary();
 assert.deepEqual(s,{min:41,median:50,last:55,max:300,count:4});
 assert.match(describeRtt(s),/tipico 50 ms · minimo 41 ms · picco 300 ms/);
 meter.clear();assert.equal(meter.summary(),null);
});
test('rejects invalid latency samples',()=>{
 const meter=makeRttMeter();
 assert.equal(meter.add(-2),null);
 assert.equal(meter.add(Number.NaN),null);
 assert.equal(meter.add(40000),null);
 assert.equal(meter.summary(),null);
});
test('classifies direct ICE and relayed candidate pair without exposing user IPs',()=>{
 const report=parts=>new Map(parts.map(p=>[p.id,p]));
 const base=[
  {type:'transport',id:'t',selectedCandidatePairId:'p'},
  {type:'candidate-pair',id:'p',localCandidateId:'l',remoteCandidateId:'r'}
 ];
 assert.equal(classifySelectedPair(report([...base,{id:'l',candidateType:'host'},{id:'r',candidateType:'srflx'}])),'host/srflx (WebRTC)');
 assert.equal(classifySelectedPair(report([...base,{id:'l',candidateType:'relay'},{id:'r',candidateType:'host'}])),'relay TURN');
 assert.equal(classifySelectedPair(report([])),'percorso non disponibile');
});
