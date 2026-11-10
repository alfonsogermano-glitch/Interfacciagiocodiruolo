import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { HybridHost } from './host-core.mjs';

function setup(t) {
  const dir = mkdtempSync(join(tmpdir(), 'hollowgate-hybrid-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const host = new HybridHost(dir);
  const a = host.create({ ownerId: 'userA', title: 'Campagna A' });
  const b = host.create({ ownerId: 'userB', title: 'Campagna B' });
  const aPlayer = host.join({ campaignId: a.campaignId, userId: 'userB', inviteCode: a.inviteCode });
  const bPlayer = host.join({ campaignId: b.campaignId, userId: 'userA', inviteCode: b.inviteCode });
  return { dir, host, a, b, aPlayer, bPlayer };
}

test('same account is GM in one campaign and player in another', t => {
  const { host, a, b, aPlayer, bPlayer } = setup(t);
  assert.equal(host.snapshot(a.token, a.campaignId).role, 'gm');
  assert.equal(host.snapshot(bPlayer.token, b.campaignId).role, 'player');
  assert.equal(host.snapshot(b.token, b.campaignId).role, 'gm');
  assert.equal(host.snapshot(aPlayer.token, a.campaignId).role, 'player');
  assert.throws(() => host.snapshot(a.token, b.campaignId), /Unauthorized/);
});

test('player can move only assigned token; GM can manage all', t => {
  const { host, a, aPlayer } = setup(t);
  assert.throws(() => host.command(aPlayer.token, a.campaignId, { type:'assign_token', id:'t', ownerId:'userB' }), /GM only/);
  host.command(a.token, a.campaignId, { type:'assign_token', id:'t', ownerId:'userB' });
  host.command(aPlayer.token, a.campaignId, { type:'move_token', id:'t', x:13, y:27 });
  assert.equal(host.snapshot(a.token, a.campaignId).tokens.t.x, 13);
  assert.throws(() => host.command(aPlayer.token, a.campaignId, { type:'move_token', id:'t', x:Infinity, y:1 }), /Invalid/);
});

test('private GM notes are never sent to players', t => {
  const { host, a, aPlayer } = setup(t);
  const aEvents=[], bEvents=[];
  host.subscribe(a.token, a.campaignId, x => aEvents.push(x));
  host.subscribe(aPlayer.token, a.campaignId, x => bEvents.push(x));
  host.command(a.token, a.campaignId, { type:'note', text:'Secret vault', visibility:'gm' });
  host.command(aPlayer.token, a.campaignId, { type:'note', text:'Player journal' });
  assert.equal(host.snapshot(aPlayer.token, a.campaignId).notes.length, 1);
  assert.equal(host.snapshot(a.token, a.campaignId).notes.length, 2);
  assert.equal(bEvents.length, 1);
  assert.equal(aEvents.length, 2);
  assert.ok(!JSON.stringify(host.snapshot(aPlayer.token, a.campaignId)).includes('Secret vault'));
  assert.throws(() => host.command(aPlayer.token, a.campaignId, { type:'note', text:'hack', visibility:'gm' }), /GM only/);
});

test('host saves campaign state on disk and recovers without cloud', t => {
  const { dir, host, a, aPlayer } = setup(t);
  host.command(aPlayer.token, a.campaignId, { type:'roll', sides:20 });
  assert.equal(host.snapshot(a.token, a.campaignId).sequence, 1);
  const recovered = new HybridHost(dir);
  const resumed = recovered.reopen({ campaignId:a.campaignId, ownerId:'userA' });
  assert.equal(recovered.snapshot(resumed.token, a.campaignId).events.length, 1);
  assert.throws(() => recovered.reopen({ campaignId:a.campaignId, ownerId:'userB' }), /Not the campaign host/);
});

test('invalid invitations and unauthorized commands fail closed', t => {
  const { host, a, b, aPlayer } = setup(t);
  assert.throws(() => host.join({ campaignId:a.campaignId, userId:'x', inviteCode:'wrong' }), /Invalid/);
  assert.throws(() => host.command(aPlayer.token,b.campaignId,{type:'roll',sides:6}), /Unauthorized/);
  assert.throws(() => host.command(aPlayer.token,a.campaignId,{type:'roll',sides:1}), /Invalid/);
});
