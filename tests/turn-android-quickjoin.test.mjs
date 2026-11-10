import test from 'node:test';
import assert from 'node:assert/strict';
import {turnIceConfig,createJoinFragment,parseJoinFragment} from '../turn-mode.mjs';
const turn={urls:['turn:relay.example.org:3478?transport=udp','turns:relay.example.org:5349?transport=tcp'],username:'temporary-user',credential:'temporary-secret'};
test('rstream JSON is parsed with all relay endpoints',()=>{
 const config=turnIceConfig(JSON.stringify(turn),'','');
 assert.equal(config.iceTransportPolicy,'relay');
 assert.deepEqual(config.iceServers[0],turn);
});
test('temporary join link round trips without exposing password in plain text',()=>{
 const config=turnIceConfig(turn.urls,turn.username,turn.credential);
 const fragment=createJoinFragment('TRHLQBJY4H8W',config);
 assert.ok(fragment.startsWith('#join='));
 assert.equal(fragment.includes(turn.credential),false);
 const invite=parseJoinFragment(fragment);
 assert.equal(invite.code,'TRHLQBJY4H8W');
 assert.deepEqual(invite.config,config);
});
test('malformed or untrusted TURN input is rejected',()=>{
 assert.throws(()=>turnIceConfig('https://evil.example', 'a','b'));
 assert.throws(()=>turnIceConfig('turn:relay.example.org:65536', 'a','b'));
 assert.throws(()=>turnIceConfig(turn.urls,'',''));
 assert.throws(()=>parseJoinFragment('#join=INVALID___'));
 assert.equal(parseJoinFragment('#anything=else'),null);
});
