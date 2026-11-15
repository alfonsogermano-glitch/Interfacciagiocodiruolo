import type { ActiveSceneMapFields, ActiveScenePublication } from '../../../types/activeScene';

export type PendingMapPublication = { value: ActiveScenePublication; fields: ActiveSceneMapFields };

/** Coalesce only map updates targeting the same original scene. */
export function mergePendingMapPublication(
  previous: PendingMapPublication | null,
  value: ActiveScenePublication,
  fields: ActiveSceneMapFields,
): PendingMapPublication | null {
  if (!previous) return { value, fields };
  if (previous.value.campaignId !== value.campaignId ||
      previous.value.chapterId !== value.chapterId ||
      previous.value.sceneId !== value.sceneId) return null;
  // Preserve disjoint field updates within the 100ms original debounce;
  // for the same field, the newest complete collection wins.
  return { value, fields: { ...previous.fields, ...fields } };
}

/** Preserve already queued settled fields even when React regenerates the scene ID. */
export function buildPersistedMapPublication(
  latest: ActiveScenePublication | null,
  next: ActiveScenePublication,
  fields: ActiveSceneMapFields,
): ActiveScenePublication {
  const sameScene = latest && latest.campaignId === next.campaignId &&
    latest.chapterId === next.chapterId && latest.sceneId === next.sceneId;
  return sameScene
    ? { ...latest, ...fields, id: next.id, publishedAt: next.publishedAt }
    : { ...next, ...fields };
}
