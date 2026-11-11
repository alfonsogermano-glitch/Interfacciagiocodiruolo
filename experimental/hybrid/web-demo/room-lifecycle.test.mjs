import test from 'node:test';
import assert from 'node:assert/strict';
import {newRoomCode,explainPeerFailure} from './room-lifecycle.mjs';
test('new room code is always derived from fresh entropy, not stored session code',()=>{
 assert.equal(newRoomCode(new Uint8Array(12)),'AAAAAAAAAAAA');
 assert.equal(newRoomCode(new Uint8Array(12).fill(1)),'BBBBBBBBBBBB');
});
test('unavailable GM and stale reserved room ID produce actionable diagnostics',()=>{
 assert.match(explainPeerFailure({type:'peer-unavailable'}),/Stanza non raggiungibile/);
 assert.match(explainPeerFailure({type:'unavailable-id'}),/codice precedente/);
 assert.match(explainPeerFailure({type:'network'}),/segnalazione/);
});
