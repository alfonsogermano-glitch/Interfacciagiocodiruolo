import test from 'node:test';
import assert from 'node:assert/strict';
import { createSignalingHub } from '../signaling-hub.mjs';
import { createConnectClient, validateHubEndpoint } from './connect-client.mjs';

test('hub URL validation forbids insecure remote endpoints and credentials',()=>{
  assert.equal(validateHubEndpoint('https://connect.example.org/'),'https://connect.example.org');
  assert.match(validateHubEndpoint('http://127.0.0.1:1234'),/^http:\/\/127/);
  for(const value of ['http://example.org','https://a:b@example.org','ftp://example.org','https://example.org/?token=abc'])
    assert.throws(()=>validateHubEndpoint(value));
});
test('automatic room + two players signals offer and answer only to intended recipient',async t=>{
  const hub=createSignalingHub();const endpoint=await hub.start();t.after(()=>hub.close());
  const gm=createConnectClient({endpoint}),alice=createConnectClient({endpoint}),bob=createConnectClient({endpoint});
  const room=(await gm.createRoom()).room; assert.match(room,/^[A-Z2-9]{8}$/);
  await alice.joinRoom(room);await bob.joinRoom(room);
  await alice.send('host','offer','offer-alice');
  const inbox=await gm.poll();assert.equal(inbox.length,1);
  assert.equal(inbox[0].from,alice.peerId);
  assert.deepEqual(await bob.poll(),[]);
  await gm.send(alice.peerId,'answer','answer-alice');
  assert.equal((await alice.poll())[0].description,'answer-alice');
  assert.deepEqual(await bob.poll(),[]);
  await bob.send('host','offer','offer-bob');
  const next=await gm.poll();assert.equal(next.length,1);assert.equal(next[0].description,'offer-bob');
  assert.deepEqual(await gm.poll(),[]);
  await alice.leave();await bob.leave();await gm.leave();
});
test('session lifecycle rejects commands before join and after leave',async t=>{
  const hub=createSignalingHub(),url=await hub.start();t.after(()=>hub.close());
  const player=createConnectClient({endpoint:url});
  await assert.rejects(()=>player.send('host','offer','x'),/No session/);
  await assert.rejects(()=>player.joinRoom('INVALID'),/Room unavailable/);
  const gm=createConnectClient({endpoint:url});
  await gm.createRoom();await player.joinRoom(gm.room);
  assert.equal(player.active,true);
  await player.leave();assert.equal(player.active,false);
  await assert.rejects(()=>player.poll(),/No session/);
  await gm.leave();
});
