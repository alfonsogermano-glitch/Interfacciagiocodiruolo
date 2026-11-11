import test from 'node:test';
import assert from 'node:assert/strict';
import { HYBRID_PERSISTENCE, destinationFor, validateHybridPreferences } from './storage-policy.mjs';

test('Hybrid has no cloud/local user selector and all shared campaign content lives on GM host', () => {
  assert.equal(HYBRID_PERSISTENCE.remoteContentPersistence, false);
  assert.equal(HYBRID_PERSISTENCE.relayStoresSessionContent, false);
  for (const role of ['gm', 'player']) assert.equal(destinationFor({ role, contentClass: 'shared-campaign' }), 'gm-host');
  assert.equal(destinationFor({ role: 'player', contentClass:'personal-draft' }), 'browser-local');
  assert.equal(destinationFor({ role: 'player', contentClass:'client-cache' }), 'ephemeral-cache');
  assert.throws(() => validateHybridPreferences({ saveMode: 'cloud' }), /Legacy saveMode/);
  assert.throws(() => validateHybridPreferences({ saveMode: 'local' }), /Legacy saveMode/);
});

test('legacy modes never authorize imports and real account identity stays outside content persistence', () => {
  assert.throws(() => validateHybridPreferences({ cloudSync: true }), /Legacy saveMode/);
  assert.equal(destinationFor({ role:'gm', contentClass:'shared-campaign' }), 'gm-host');
  assert.throws(() => destinationFor({ role:'gm', contentClass:'auth-users' }), /Unknown content class/);
});
