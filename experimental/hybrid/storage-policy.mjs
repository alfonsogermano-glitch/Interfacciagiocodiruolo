/**
 * Hollowgate Hybrid storage contract. Pure code, no Supabase dependency.
 *
 * There is no "local/cloud" user preference in Hybrid. Session content lives
 * exclusively on the GM Host; players hold only a disposable client cache.
 * Legacy storage modes are input formats for explicit one-time import only.
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

/** Blocks silent data re-interpretation. User data is imported only after
 * independently verified export + checksum + campaign owner approval.
 */
export function validateLegacyImport({ source, backupVerified, ownerApproved, contentsHash }) {
  if (source !== 'legacy-local' && source !== 'legacy-cloud') throw new Error('Unknown legacy source');
  if (backupVerified !== true || ownerApproved !== true) throw new Error('Legacy data import requires backup and owner approval');
  if (typeof contentsHash !== 'string' || !/^[a-f0-9]{64}$/.test(contentsHash)) throw new Error('SHA-256 checksum required');
  return { source, destination: 'gm-host', importAllowed: true };
}
