import test from 'node:test';
import assert from 'node:assert/strict';
import {createAuthorizedLiveSession} from '../src/authorized-live-session.mjs';
const gm='12345678-1234-4123-8123-123456789abc';
const player='22345678-1234-4123-8123-123456789abc';
const campaign='32345678-1234-4123-8123-123456789abc';
const args={origin:'https://staging.hollowgate.quest/',WebSocketImpl:class {},PeerConnectionImpl:class {}};
test('live session cannot start without an explicit verified game-session capability',()=>{
 assert.throws(()=>createAuthorizedLiveSession({...args,bootstrap:{id:gm,campaigns:[{id:campaign}]},campaign:{id:campaign,ownerId:gm}}),/not authorized/);
 assert.throws(()=>createAuthorizedLiveSession({...args,bootstrap:{id:gm,gameSessionEnabled:false,campaigns:[{id:campaign}]},campaign:{id:campaign,ownerId:gm}}),/not authorized/);
});
test('live session cannot start for campaigns absent from authenticated membership',()=>{
 assert.throws(()=>createAuthorizedLiveSession({...args,bootstrap:{id:player,gameSessionEnabled:true,campaigns:[]},campaign:{id:campaign,ownerId:gm}}),/not authorized/);
 assert.throws(()=>createAuthorizedLiveSession({...args,bootstrap:{id:player,gameSessionEnabled:true,campaigns:[{id:campaign}]},campaign:{id:'not-a-uuid',ownerId:gm}}),/not authorized/);
});
