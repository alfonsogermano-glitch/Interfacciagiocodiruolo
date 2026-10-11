import { useCallback, useEffect, useRef, useState } from 'react';
import {
  clearActiveScene,
  loadActiveScene,
  saveActiveScene,
} from '../../../services/campaign/activeScene';
import { useCampaignChannel } from '../../../services/realtime/campaignChannel';
import {
  isActiveScenePublication,
  type ActiveScenePublication,
} from '../../../types/activeScene';

export function useActiveScene(campaignId: string | null | undefined) {
  const [activeScene, setActiveScene] = useState<ActiveScenePublication | null>(null);
  const [loading, setLoading] = useState(!!campaignId);
  const receivedBroadcast = useRef(false);

  const { isReady: channelReady, send } = useCampaignChannel(campaignId, {
    onBroadcast: {
      active_scene_change: (message) => {
        const next = message?.payload?.activeScene;
        if (next === null || isActiveScenePublication(next)) {
          receivedBroadcast.current = true;
          setActiveScene(next);
          setLoading(false);
        }
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
        setActiveScene(isActiveScenePublication(value) ? value : null);
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

  const publish = useCallback(async (value: ActiveScenePublication) => {
    if (!campaignId) return;
    await saveActiveScene(campaignId, value);
    setActiveScene(value);
    await send('active_scene_change', { activeScene: value });
  }, [campaignId, send]);

  const clear = useCallback(async () => {
    if (!campaignId) return;
    await clearActiveScene(campaignId);
    setActiveScene(null);
    await send('active_scene_change', { activeScene: null });
  }, [campaignId, send]);

  return { activeScene, loading, channelReady, publish, clear };
}
