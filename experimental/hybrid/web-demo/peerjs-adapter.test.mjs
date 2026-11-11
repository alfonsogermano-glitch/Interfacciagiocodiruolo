import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import {adaptPeerJsConnection} from './peerjs-adapter.mjs';
const fake=(alreadyOpen=false)=>{
 const raw=new EventEmitter();
 raw.open=alreadyOpen;raw.sent=[];raw.send=value=>raw.sent.push(value);
 raw.close=()=>{raw.open=false;raw.emit('close')};
 return raw;
};
test('regression: incoming connection is already open before adapter attaches (mobile authorization)',()=>{
 const raw=fake(true),peer=adaptPeerJsConnection(raw);
 assert.equal(peer.readyState,'open');
 peer.send(JSON.stringify({kind:'approved'}));
 peer.send(JSON.stringify({kind:'snapshot',state:{sequence:1}}));
 assert.deepEqual(raw.sent.map(x=>x.kind),['approved','snapshot']);
});
test('open and data are bridged, late messages are not forwarded after close',()=>{
 const raw=fake(),peer=adaptPeerJsConnection(raw);
 let opens=0,close=0;const messages=[];
 peer.onopen=()=>opens++;peer.onclose=()=>close++;
 peer.onmessage=e=>messages.push(JSON.parse(e.data));
 assert.equal(peer.readyState,'connecting');
 raw.open=true;raw.emit('open');assert.equal(opens,1);
 raw.emit('data',{kind:'snapshot'});assert.deepEqual(messages,[{kind:'snapshot'}]);
 peer.close();assert.equal(peer.readyState,'closed');assert.equal(close,1);
 raw.emit('close');raw.emit('data',{kind:'late'});
 assert.equal(close,1);assert.equal(messages.length,1);
});
test('errors close the adapter and surface to caller',()=>{
 const raw=fake(true);let failure=null;
 const peer=adaptPeerJsConnection(raw,{onError:e=>failure=e.message});
 let close=0;peer.onclose=()=>close++;
 raw.emit('error',new Error('network'));
 assert.equal(failure,'network');assert.equal(close,1);assert.equal(peer.readyState,'closed');
});

test('already-open player connection invokes late open handler once to send join',async()=>{
 const raw=fake(true),peer=adaptPeerJsConnection(raw);
 let count=0;
 peer.onopen=()=>{count++;peer.send(JSON.stringify({kind:'join'}))};
 await Promise.resolve();
 assert.equal(count,1);assert.deepEqual(raw.sent,[{kind:'join'}]);
 raw.emit('open');assert.equal(count,1);
});
