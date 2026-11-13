import { useCallback, useEffect, useRef, useState } from 'react';
import {
  clearActiveScene,
  loadActiveScene,
  saveActiveScene,
} from '../../../services/campaign/activeScene';
import { useCampaignChannel } from '../../../services/realtime/campaignChannel';
import { notifyCommittedMapPublication } from './activeScenePublicationObserver';
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
  const publicationDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const publicationPendingRef = useRef<{ value: ActiveScenePublication; fields: ActiveSceneMapFields } | null>(null);
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
          // I delta del patch contengono solo dati di mappa, che vivono nel
          // capitolo: id e scena della pubblicazione non devono bloccarli.
          // Prima si esigeva anche current.id === patch.id, ma l'id veniva
          // rigenerato ad ogni render quando una Scena era selezionata, e
          // cosi' ogni aggiornamento (posizioni PDI, token, disegni, nebbia)
          // veniva scartato silenziosamente sugli schermi dei giocatori.
          if (!current || current.campaignId !== patch.campaignId || current.chapterId !== patch.chapterId) return current;
          if (patch.publishedAt <= current.publishedAt) return current;
          // Continuita': il patch dichiara lo stato su cui e' calcolato. Se
          // coincide con quello gia' applicato qui, il delta e' applicabile.
          // Senza continuita' (patch perso, snapshot non allineato, migrazione
          // dell'id) si ricarica lo snapshot completo invece di ignorare.
          const continuous = patch.basePublishedAt
            ? patch.basePublishedAt === current.publishedAt
            : patch.id === current.id;
          if (!continuous) {
            console.warn('[activeScene] patch di mappa non continua, ricarico lo snapshot completo:', { patchId: patch.id, currentId: current.id, basePublishedAt: patch.basePublishedAt, currentPublishedAt: current.publishedAt });
            void loadActiveScene(patch.campaignId).then(value => {
              if (!isActiveScenePublication(value)) return;
              setActiveScene(latest => {
                // Il confronto e' solo sul tempo: un snapshot piu' vecchio non
                // deve mai sostituire lo stato corrente, anche se l'id differisce.
                if (latest && latest.publishedAt >= value.publishedAt) return latest;
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
            // Allinea la pubblicazione del client a quella del GM (id e scena
            // possono cambiare quando il GM passa da Capitolo a Scena).
            id: patch.id,
            sceneId: patch.sceneId,
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

  useEffect(() => {
    return () => {
      if (publicationDebounceRef.current !== null) {
        clearTimeout(publicationDebounceRef.current);
        publicationDebounceRef.current = null;
      }
    };
  }, []);

  // Pubblica subito la modifica rimasta in coda. Usata dal debounce normale e
  // dal ritorno della scheda in primo piano: un GM con la scheda in background
  // subisce il throttle dei timer del browser (~1s, o peggio) e senza questo
  // flush le modifiche in arrivo dai giocatori resterebbero sospese finche'
  // la scheda non viene riattivata.
  const flushPendingPublication = useCallback(() => {
    if (publicationDebounceRef.current !== null) {
      clearTimeout(publicationDebounceRef.current);
      publicationDebounceRef.current = null;
    }
    const pending = publicationPendingRef.current;
    publicationPendingRef.current = null;
    if (!pending) return;
    const { value: pendingValue, fields: pendingFields } = pending;
    const publishedAtMs = Math.max(Date.now(), publicationClockRef.current + 1, Date.parse(pendingValue.publishedAt) || 0);
    publicationClockRef.current = publishedAtMs;
    const next = { ...pendingValue, publishedAt: new Date(publishedAtMs).toISOString() };
    const operation = publicationQueueRef.current.then(async () => {
      const latest = latestPublicationRef.current;
      const persisted = latest && latest.id === next.id ? { ...latest, ...pendingFields, publishedAt: next.publishedAt } : next;
      const patch: ActiveSceneMapPatch = {
        id: next.id,
        campaignId: next.campaignId,
        sceneId: next.sceneId,
        chapterId: next.chapterId,
        publishedAt: next.publishedAt,
        basePublishedAt: latest?.publishedAt,
        ...(pendingFields.mapPlacement ? { mapPlacement: pendingFields.mapPlacement } : {}),
        ...(pendingFields.gridSettings ? { gridSettings: pendingFields.gridSettings } : {}),
        ...(pendingFields.mapObjectOrder && !sameObjectOrder(latest?.mapObjectOrder, pendingFields.mapObjectOrder) ? { mapObjectOrder: pendingFields.mapObjectOrder } : {}),
        mapTokensDelta: pendingFields.mapTokens ? collectionDelta(latest?.mapTokens, pendingFields.mapTokens) : undefined,
        mapDrawingsDelta: pendingFields.mapDrawings ? collectionDelta(latest?.mapDrawings, pendingFields.mapDrawings) : undefined,
        mapPoisDelta: pendingFields.mapPois ? collectionDelta(latest?.mapPois, pendingFields.mapPois) : undefined,
        mapFogDelta: pendingFields.mapFog ? collectionDelta(latest?.mapFog, pendingFields.mapFog) : undefined,
      };
      await saveActiveScene(campaignId, persisted);
      latestPublicationRef.current = persisted;
      setActiveScene(persisted);
      await send('active_scene_map_patch', { patch });
      // Only the settled, queued legacy publication is observable by
      // experimental Aruba adapters. React setters and debounce alone are
      // not evidence that the map has been persisted and broadcast.
      notifyCommittedMapPublication(persisted);
    });
    publicationQueueRef.current = operation.catch(() => {});
    void operation;
  }, [campaignId, send]);

  useEffect(() => {
    const onVisibilityChange = () => {
      if (document.visibilityState === 'visible') flushPendingPublication();
    };
    document.addEventListener('visibilitychange', onVisibilityChange);
    return () => document.removeEventListener('visibilitychange', onVisibilityChange);
  }, [flushPendingPublication]);

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
    publicationPendingRef.current = { value, fields };
    if (publicationDebounceRef.current !== null) {
      clearTimeout(publicationDebounceRef.current);
    }
    publicationDebounceRef.current = setTimeout(() => {
      publicationDebounceRef.current = null;
      flushPendingPublication();
    }, 100);
  }, [campaignId, flushPendingPublication]);

  const clear = useCallback(async () => {
    if (!campaignId) return;
    await clearActiveScene(campaignId);
    latestPublicationRef.current = null;
    setActiveScene(null);
    await send('active_scene_change', { activeScene: null });
  }, [campaignId, send]);

  return { activeScene, loading, channelReady, publish, publishMapPatch, clear };
}
