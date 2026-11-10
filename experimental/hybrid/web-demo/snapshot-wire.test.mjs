import test from 'node:test';
import assert from 'node:assert/strict';
import {EventEmitter} from 'node:events';
import {prepareSnapshot,snapshotPackets,createSnapshotAssembler} from './snapshot-wire.mjs';
import {adaptPeerJsConnection} from './peerjs-adapter.mjs';

const makeState=(activityCount=160)=>({
 title:'Demo mobile',role:'player',self:'P123',sequence:activityCount,
 tokens:{gm:{owner:'gm',x:20,y:20},P123:{owner:'P123',x:30,y:50}},
 activity:Array.from({length:activityCount},(_,i)=>({sequence:i,label:'Test nota '+i+' '+('a'.repeat(240)),visibility:'public'}))
});
test('snapshot is chunked and bounded for long GM activity history',()=>{
 const state=makeState();
 const packets=snapshotPackets(state,'transfer-001');
 assert.ok(packets.length>1);
 assert.ok(packets.every(p=>p.kind==='snapshot-part'&&p.content.length<=2400));
 const rebuilt=[];const assembler=createSnapshotAssembler(s=>rebuilt.push(s));
 for(const packet of packets)assembler.accept(packet);
 assert.equal(rebuilt.length,1);
 assert.equal(rebuilt[0].activity.length,48);
 assert.deepEqual(rebuilt[0].tokens,state.tokens);
 assert.equal(rebuilt[0].sequence,state.sequence);
});
test('GM to mobile PeerJS bridge transmits and reconstructs large state and returns ACK',()=>{
 const gmRaw=new EventEmitter(),mobileRaw=new EventEmitter();
 gmRaw.open=mobileRaw.open=true;
 gmRaw.send=p=>mobileRaw.emit('data',p);
 mobileRaw.send=p=>gmRaw.emit('data',p);
 gmRaw.close=mobileRaw.close=()=>{};
 const gm=adaptPeerJsConnection(gmRaw),mobile=adaptPeerJsConnection(mobileRaw);
 const state=makeState(150);let received=null,acked=false;
 const assembly=createSnapshotAssembler(snapshot=>{received=snapshot;mobile.send(JSON.stringify({kind:'snapshot-ack',sequence:snapshot.sequence}));});
 mobile.onmessage=event=>{
  const msg=JSON.parse(event.data);
  assembly.accept(msg);
 };
 gm.onmessage=event=>{
  const msg=JSON.parse(event.data);
  if(msg.kind==='snapshot-ack'&&msg.sequence===state.sequence)acked=true;
 };
 for(const packet of snapshotPackets(state,'transfer-002'))gm.send(JSON.stringify(packet));
 assert.equal(received.sequence,150);
 assert.equal(acked,true);
 assert.equal(received.activity.length,48);
});
test('small snapshot stays one packet and malformed oversized fragments are refused',()=>{
 const state=makeState(0);
 const packets=snapshotPackets(state,'transfer-003');
 assert.equal(packets.length,1);
 assert.equal(packets[0].kind,'snapshot');
 let failures=0;const assembled=createSnapshotAssembler(()=>{throw Error('unexpected')},()=>failures++);
 assembled.accept({kind:'snapshot-part',id:'transfer-004',index:0,total:49,content:'x'});
 assert.equal(failures,1);
 assert.throws(()=>snapshotPackets({...state,tokens:{data:'x'.repeat(100000)}},'transfer-005'),/transport limit/);
});
