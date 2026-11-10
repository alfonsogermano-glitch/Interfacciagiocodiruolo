import test from 'node:test';
import assert from 'node:assert/strict';
import {summarizeIceStats,inspectIceConnection} from './ice-candidate-report.mjs';
test('reports missing host/remote candidates without exposing IP addresses',()=>{
 const stats=new Map([
  ['l',{type:'local-candidate',candidateType:'host',address:'192.168.1.2'}],
  ['p',{type:'candidate-pair',state:'failed'}]
 ]);
 const result=summarizeIceStats(stats);
 assert.match(result,/locale \[host:1/);
 assert.match(result,/remoto \[host:0/);
 assert.match(result,/fallite 1/);
 assert.doesNotMatch(result,/192\.168/);
});
test('reports candidate pair outcomes from WebRTC stats',async()=>{
 const pc={getStats:async()=>new Map([
  ['a',{type:'local-candidate',candidateType:'srflx'}],
  ['b',{type:'remote-candidate',candidateType:'host'}],
  ['c',{type:'candidate-pair',state:'succeeded'}]
 ])};
 let shown='';
 const result=await inspectIceConnection({peerConnection:pc},value=>shown=value);
 assert.equal(result,shown);
 assert.match(result,/ok 1/);
 assert.match(result,/locale \[host:0 srflx:1/);
 assert.match(result,/remoto \[host:1/);
});
