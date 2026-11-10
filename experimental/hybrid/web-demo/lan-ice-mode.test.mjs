import test from 'node:test';
import assert from 'node:assert/strict';
import {encodeRoomMode,roomIceMode,iceConfigForRoom} from './lan-ice-mode.mjs';
const normal={iceServers:[{urls:'stun:stun.l.google.com:19302'}]};
test('LAN room code selects local host ICE candidates at BOTH ends',()=>{
 const code=encodeRoomMode('ABCDEFGHJKLM',true);
 assert.equal(code,'LBCDEFGHJKLM');
 assert.equal(roomIceMode(code),'lan');
 assert.deepEqual(iceConfigForRoom(code,normal),{iceServers:[]});
});
test('normal mode preserves proven 5G STUN signaling',()=>{
 const code=encodeRoomMode('ABCDEFGHJKLM',false);
 assert.equal(code,'WBCDEFGHJKLM');
 assert.equal(roomIceMode(code),'standard');
 assert.equal(iceConfigForRoom(code,normal),normal);
 assert.equal(roomIceMode('G9LU828M4EB3'),'standard');
});
test('invalid codes cannot silently select LAN mode',()=>{
 assert.throws(()=>encodeRoomMode('invalid!',true),/Invalid room/);
});
