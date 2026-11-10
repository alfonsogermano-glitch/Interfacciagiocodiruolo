import test from 'node:test';
import assert from 'node:assert/strict';
import { HYBRID_PERSISTENCE, destinationFor, validateHybridPreferences, validateLegacyImport } from './storage-policy.mjs';

test('Hybrid has no cloud/local user selector and all shared campaign content lives on GM host', () => {
  assert.equal(HYBRID_PERSISTENCE.remoteContentPersistence, false);
  assert.equal(HYBRID_PERSISTENCE.relayStoresSessionContent, false);
  for (const role of ['gm', 'player']) assert.equal(destinationFor({ role, contentClass: 'shared-campaign' }), 'gm-host');
  assert.equal(destinationFor({ role: 'player', contentClass:'personal-draft' }), 'browser-local');
  assert.equal(destinationFor({ role: 'player', contentClass:'client-cache' }), 'ephemeral-cache');
  assert.throws(() => validateHybridPreferences({ saveMode: 'cloud' }), /Legacy saveMode/);
  assert.throws(() => validateHybridPreferences({ saveMode: 'local' }), /Legacy saveMode/);
});

test('legacy cloud and IndexedDB data require explicit verified migration', () => {
  const valid = { source: 'legacy-cloud', backupVerified: true, ownerApproved: true, contentsHash: 'a'.repeat(64) };
  assert.deepEqual(validateLegacyImport(valid), { source: 'legacy-cloud', destination: 'gm-host', importAllowed: true });
  assert.equal(validateLegacyImport({ ...valid, source:'legacy-local' }).destination, 'gm-host');
  assert.throws(() => validateLegacyImport({ ...valid, backupVerified:false }), /backup/);
  assert.throws(() => validateLegacyImport({ ...valid, ownerApproved:false }), /approval/);
  assert.throws(() => validateLegacyImport({ ...valid, contentsHash:'' }), /SHA-256/);
});
