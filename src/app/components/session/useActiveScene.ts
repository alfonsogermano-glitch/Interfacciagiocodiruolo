import { useCallback, useEffect, useRef, useState } from 'react';
import {
  clearActiveScene,
  loadActiveScene,
  saveActiveScene,
} from '../../../services/campaign/activeScene';
import { useCampaignChannel } from '../../../services/realtime/campaignChannel';
import {
  isActiveScenePublication,
  type ActiveSceneCollectionDelta,
  type ActiveSceneMapFields,
  type ActiveSceneMapPatch,
  type ActiveScenePublication,
} from '../../../types/activeScene';

function collectionDelta<T extends { id: string }>(previous: T[] = [], next: T[] = []): ActiveSceneCollectionDelta<T> | undefined {
  const previousById = new Map(previous.map(item => [item.id, item]));
  const nextIds = new Set(next.map(item => item.id));
  const upsert = next.filter(item => {
    const old = previousById.get(item.id);
    return !old || JSON.stringify(old) !== JSON.stringify(item);
  });
  const deleteIds = previous.filter(item => !nextIds.has(item.id)).map(item => item.id);
  const previousOrder = previous.map(item => item.id);
  const nextOrder = next.map(item => item.id);
  const orderChanged = previousOrder.length !== nextOrder.length || previousOrder.some((id, index) => id !== nextOrder[index]);
  return upsert.length > 0 || deleteIds.length > 0 || orderChanged ? { upsert, deleteIds, ...(orderChanged ? { order: nextOrder } : {}) } : undefined;
}

function applyCollectionDelta<T extends { id: string }>(current: T[] = [], delta?: ActiveSceneCollectionDelta<T>): T[] {
  if (!delta) return current;
  const deleted = new Set(delta.deleteIds);
  const byId = new Map(current.filter(item => !deleted.has(item.id)).map(item => [item.id, item]));
  delta.upsert.forEach(item => byId.set(item.id, item));
  if (delta.order) return delta.order.map(id => byId.get(id)).filter((item): item is T => !!item);
  return [...byId.values()];
}

function sameObjectOrder(previous: ActiveScenePublication['mapObjectOrder'], next: ActiveScenePublication['mapObjectOrder']) {
  if (previous === next) return true;
  if (!previous || !next || previous.length !== next.length) return false;
  return previous.every((item, index) => item.id === next[index].id && item.family === next[index].family);
}

export function useActiveScene(campaignId: string | null | undefined) {
  const [activeScene, setActiveScene] = useState<ActiveScenePublication | null>(null);
  const [loading, setLoading] = useState(!!campaignId);
  const receivedBroadcast = useRef(false);
  const publicationClockRef = useRef(0);
  const publicationQueueRef = useRef<Promise<void>>(Promise.resolve());
  const latestPublicationRef = useRef<ActiveScenePublication | null>(null);
  const channelWasReadyRef = useRef(false);

  const { isReady: channelReady, send } = useCampaignChannel(campaignId, {
    onBroadcast: {
      active_scene_change: (message) => {
        const next = message?.payload?.activeScene;
        if (next === null || isActiveScenePublication(next)) {
          receivedBroadcast.current = true;
          if (next) publicationClockRef.current = Math.max(publicationClockRef.current, Date.parse(next.publishedAt) || 0);
          setActiveScene(current => {
            const accepted = !next || !current || current.id !== next.id || next.publishedAt > current.publishedAt ? next : current;
            latestPublicationRef.current = accepted;
            return accepted;
          });
          setLoading(false);
        }
      },
      active_scene_map_patch: (message) => {
        const patch = message?.payload?.patch as ActiveSceneMapPatch | undefined;
        if (!patch || typeof patch.publishedAt !== 'string') return;
        setActiveScene(current => {
          if (!current || current.id !== patch.id || current.campaignId !== patch.campaignId || current.sceneId !== patch.sceneId || current.chapterId !== patch.chapterId) return current;
          if (patch.publishedAt <= current.publishedAt) return current;
          if (patch.basePublishedAt && patch.basePublishedAt !== current.publishedAt) {
            void loadActiveScene(patch.campaignId).then(value => {
              if (!isActiveScenePublication(value)) return;
              setActiveScene(latest => {
                if (latest && latest.id === value.id && latest.publishedAt >= value.publishedAt) return latest;
                latestPublicationRef.current = value;
                publicationClockRef.current = Math.max(publicationClockRef.current, Date.parse(value.publishedAt) || 0);
                return value;
              });
            }).catch(error => console.error('Recupero snapshot mappa realtime non riuscito:', error));
            return current;
          }
          publicationClockRef.current = Math.max(publicationClockRef.current, Date.parse(patch.publishedAt) || 0);
          const next: ActiveScenePublication = {
            ...current,
            ...(patch.mapPlacement ? { mapPlacement: patch.mapPlacement } : {}),
            ...(patch.gridSettings ? { gridSettings: patch.gridSettings } : {}),
            ...(patch.mapObjectOrder ? { mapObjectOrder: patch.mapObjectOrder } : {}),
            mapTokens: applyCollectionDelta(current.mapTokens, patch.mapTokensDelta),
            mapDrawings: applyCollectionDelta(current.mapDrawings, patch.mapDrawingsDelta),
            mapPois: applyCollectionDelta(current.mapPois, patch.mapPoisDelta),
            mapFog: applyCollectionDelta(current.mapFog, patch.mapFogDelta),
            publishedAt: patch.publishedAt,
          };
          latestPublicationRef.current = next;
          return next;
        });
      },
    },
  });

  useEffect(() => {
    let cancelled = false;
    receivedBroadcast.current = false;
    setActiveScene(null);
    setLoading(!!campaignId);
    if (!campaignId) return () => { cancelled = true; };

    void loadActiveScene(campaignId).then(value => {
      if (!cancelled && !receivedBroadcast.current) {
        const next = isActiveScenePublication(value) ? value : null;
        latestPublicationRef.current = next;
        if (next) publicationClockRef.current = Math.max(publicationClockRef.current, Date.parse(next.publishedAt) || 0);
        setActiveScene(next);
        setLoading(false);
      }
    }).catch(error => {
      if (!cancelled) {
        console.error('Caricamento scena attiva non riuscito:', error);
        setLoading(false);
      }
    });

    return () => { cancelled = true; };
  }, [campaignId]);

  useEffect(() => {
    const reconnected = channelReady && !channelWasReadyRef.current;
    channelWasReadyRef.current = channelReady;
    if (!reconnected || !campaignId) return;
    void loadActiveScene(campaignId).then(value => {
      if (!isActiveScenePublication(value)) return;
      setActiveScene(current => {
        if (current && current.id === value.id && current.publishedAt >= value.publishedAt) return current;
        latestPublicationRef.current = value;
        publicationClockRef.current = Math.max(publicationClockRef.current, Date.parse(value.publishedAt) || 0);
        return value;
      });
    }).catch(error => console.error('Risincronizzazione scena attiva non riuscita:', error));
  }, [campaignId, channelReady]);

  const publish = useCallback(async (value: ActiveScenePublication) => {
    if (!campaignId) return;
    const publishedAtMs = Math.max(Date.now(), publicationClockRef.current + 1, Date.parse(value.publishedAt) || 0);
    publicationClockRef.current = publishedAtMs;
    const next = { ...value, publishedAt: new Date(publishedAtMs).toISOString() };
    const operation = publicationQueueRef.current.then(async () => {
      await saveActiveScene(campaignId, next);
      latestPublicationRef.current = next;
      setActiveScene(next);
      await send('active_scene_change', { activeScene: next });
    });
    publicationQueueRef.current = operation.catch(() => {});
    await operation;
  }, [campaignId, send]);

  const publishMapPatch = useCallback(async (value: ActiveScenePublication, fields: ActiveSceneMapFields) => {
    if (!campaignId) return;
    const publishedAtMs = Math.max(Date.now(), publicationClockRef.current + 1, Date.parse(value.publishedAt) || 0);
    publicationClockRef.current = publishedAtMs;
    const next = { ...value, publishedAt: new Date(publishedAtMs).toISOString() };
    const operation = publicationQueueRef.current.then(async () => {
      const latest = latestPublicationRef.current;
      const persisted = latest && latest.id === next.id ? { ...latest, ...fields, publishedAt: next.publishedAt } : next;
      const patch: ActiveSceneMapPatch = {
        id: next.id,
        campaignId: next.campaignId,
        sceneId: next.sceneId,
        chapterId: next.chapterId,
        publishedAt: next.publishedAt,
        basePublishedAt: latest?.publishedAt,
        ...(fields.mapPlacement ? { mapPlacement: fields.mapPlacement } : {}),
        ...(fields.gridSettings ? { gridSettings: fields.gridSettings } : {}),
        ...(fields.mapObjectOrder && !sameObjectOrder(latest?.mapObjectOrder, fields.mapObjectOrder) ? { mapObjectOrder: fields.mapObjectOrder } : {}),
        mapTokensDelta: fields.mapTokens ? collectionDelta(latest?.mapTokens, fields.mapTokens) : undefined,
        mapDrawingsDelta: fields.mapDrawings ? collectionDelta(latest?.mapDrawings, fields.mapDrawings) : undefined,
        mapPoisDelta: fields.mapPois ? collectionDelta(latest?.mapPois, fields.mapPois) : undefined,
        mapFogDelta: fields.mapFog ? collectionDelta(latest?.mapFog, fields.mapFog) : undefined,
      };
      await saveActiveScene(campaignId, persisted);
      latestPublicationRef.current = persisted;
      setActiveScene(persisted);
      await send('active_scene_map_patch', { patch });
    });
    publicationQueueRef.current = operation.catch(() => {});
    await operation;
  }, [campaignId, send]);

  const clear = useCallback(async () => {
    if (!campaignId) return;
    await clearActiveScene(campaignId);
    latestPublicationRef.current = null;
    setActiveScene(null);
    await send('active_scene_change', { activeScene: null });
  }, [campaignId, send]);

  return { activeScene, loading, channelReady, publish, publishMapPatch, clear };
}
