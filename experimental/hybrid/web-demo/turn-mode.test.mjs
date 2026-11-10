import test from 'node:test';
import assert from 'node:assert/strict';
import {isTurnRoom,turnIceConfig} from './turn-mode.mjs';
test('TURN room code is explicit and case insensitive',()=>{
 assert.equal(isTurnRoom('TABCDEFGHJKL'),true);
 assert.equal(isTurnRoom('tabc'),true);
 assert.equal(isTurnRoom('LABCDEFGHJKL'),false);
});
test('TURN requires a real configured server and keeps credentials in browser ICE config only',()=>{
 assert.deepEqual(turnIceConfig('turns:relay.example.org:5349?transport=tcp','test','secret'),{
  iceServers:[{urls:'turns:relay.example.org:5349?transport=tcp',username:'test',credential:'secret'}],iceTransportPolicy:'relay'
 });
 assert.throws(()=>turnIceConfig('stun:example.org','x','y'),/TURN/);
 assert.throws(()=>turnIceConfig('turn:example.org:3478','','pass'),/utente/);
 assert.throws(()=>turnIceConfig('turn:example.org:3478','user',''),/utente/);
 assert.throws(()=>turnIceConfig('turn:example.org:99999','user','secret'),/Porta/);
});
