/**
 * Hollowgate Hybrid storage contract. Pure code, no Supabase dependency.
 *
 * There is no "local/cloud" user preference in Hybrid. Session content lives
 * exclusively on the GM Host; players hold only a disposable client cache.
 * Existing campaign/test content is intentionally not migrated. Existing real\n * accounts must remain intact until replacement authentication is verified.
 */
export const HYBRID_PERSISTENCE = Object.freeze({
  local: 'gm-host',
  remoteContentPersistence: false,
  backupsInCloud: false,
  relayStoresSessionContent: false,
});

export function destinationFor({ role, contentClass }) {
  if (role !== 'gm' && role !== 'player') throw new Error('Unknown campaign role');
  if (contentClass === 'shared-campaign') return 'gm-host';
  if (contentClass === 'personal-draft') return 'browser-local';
  if (contentClass === 'client-cache') return 'ephemeral-cache';
  throw new Error('Unknown content class');
}

/** Explicitly forbid the legacy cloud/local toggle from selecting Hybrid storage. */
export function validateHybridPreferences(settings = {}) {
  if (settings && typeof settings === 'object' && ('saveMode' in settings || 'cloudSync' in settings)) {
    throw new Error('Legacy saveMode must not control Hybrid persistence');
  }
  return HYBRID_PERSISTENCE;
}

