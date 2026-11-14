import type { ActiveScenePublication } from '../../../types/activeScene';

/**
 * Read-only, opt-in observation point for the original GM map publication.
 * A notification is emitted only after saveActiveScene AND the legacy
 * active_scene_map_patch send have fulfilled, never at the React setter.
 *
 * This is not a replay bus, persistence proof beyond saveActiveScene, or a
 * multiplayer feature flag. Subscriber failures must not affect the original
 * publication pipeline.
 */
export type CommittedMapPublication = Readonly<{
  campaignId: string;
  chapterId: string;
  publishedAt: string;
  state: ActiveScenePublication;
}>;

type Listener = (value: CommittedMapPublication) => void;
const listeners = new Map<string, Set<Listener>>();

export function subscribeCommittedMapPublication(
  campaignId: string,
  listener: Listener,
): () => void {
  if (!campaignId || typeof listener !== 'function') {
    throw new TypeError('A campaign and publication listener are required');
  }
  let group = listeners.get(campaignId);
  if (!group) {
    group = new Set();
    listeners.set(campaignId, group);
  }
  group.add(listener);
  let subscribed = true;
  return () => {
    if (!subscribed) return;
    subscribed = false;
    const current = listeners.get(campaignId);
    current?.delete(listener);
    if (current?.size === 0) listeners.delete(campaignId);
  };
}

/** Called by the ORIGINAL hook after BOTH awaited publication operations. */
export function notifyCommittedMapPublication(
  value: ActiveScenePublication,
): void {
  const group = listeners.get(value.campaignId);
  if (!group?.size) return;
  for (const listener of [...group]) {
    // The listener must never mutate the original React state or cause an
    // exception that makes a successful legacy publication appear failed.
    try {
      const state = structuredClone(value);
      listener(Object.freeze({
        campaignId: value.campaignId,
        chapterId: value.chapterId,
        publishedAt: value.publishedAt,
        state,
      }));
    } catch (error) {
      console.error('Committed map observer failed:', error);
    }
  }
}

/** Read-only failure signal for the original queued map publication. */
type FailureListener = (value: Readonly<{ campaignId: string }>) => void;
const failureListeners = new Map<string, Set<FailureListener>>();
export function subscribeFailedMapPublication(campaignId: string, listener: FailureListener): () => void {
  if (!campaignId || typeof listener !== 'function') throw new TypeError('Campaign and listener required');
  const group = failureListeners.get(campaignId) ?? new Set<FailureListener>();
  failureListeners.set(campaignId, group);
  group.add(listener);
  return () => {
    group.delete(listener);
    if (group.size === 0) failureListeners.delete(campaignId);
  };
}
export function notifyFailedMapPublication(campaignId: string): void {
  const group = failureListeners.get(campaignId);
  if (!group) return;
  for (const listener of [...group]) {
    try { listener(Object.freeze({campaignId})); }
    catch (error) { console.error('Failed map observer failed:', error); }
  }
}
