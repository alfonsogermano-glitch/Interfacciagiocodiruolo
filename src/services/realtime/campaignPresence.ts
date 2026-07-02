import { supabase } from '../../app/auth/AuthContext';

interface ChannelEntry {
  channel: ReturnType<typeof supabase.channel>;
  refCount: number;
  releaseTimer: ReturnType<typeof setTimeout> | null;
}

const registry: Record<string, ChannelEntry> = {};
const GRACE_PERIOD_MS = 1500;

export function acquireCampaignChannel(
  campaignId: string,
  handlers: {
    onPresenceSync?: (channel: ReturnType<typeof supabase.channel>) => void;
    onBroadcast?: Record<string, (payload: any) => void>;
    onSubscribed?: (channel: ReturnType<typeof supabase.channel>) => void;
  }
) {
  let entry = registry[campaignId];

  if (entry) {
    if (entry.releaseTimer) {
      clearTimeout(entry.releaseTimer);
      entry.releaseTimer = null;
    }
    entry.refCount += 1;
    // Il canale esiste già ed è (o sta per essere) SUBSCRIBED: notifica subito
    if (handlers.onSubscribed) handlers.onSubscribed(entry.channel);
    return entry.channel;
  }

  const ch = supabase.channel(`campaign:${campaignId}`, { config: { private: true } });

  if (handlers.onPresenceSync) {
    ch.on('presence', { event: 'sync' }, () => handlers.onPresenceSync!(ch));
  }
  if (handlers.onBroadcast) {
    Object.entries(handlers.onBroadcast).forEach(([event, fn]) => {
      ch.on('broadcast', { event }, (msg: any) => fn(msg));
    });
  }

  ch.subscribe((status) => {
    if (status === 'SUBSCRIBED' && handlers.onSubscribed) handlers.onSubscribed(ch);
  });

  registry[campaignId] = { channel: ch, refCount: 1, releaseTimer: null };
  return ch;
}

export function releaseCampaignChannel(campaignId: string, untrack: boolean) {
  const entry = registry[campaignId];
  if (!entry) return;

  entry.refCount -= 1;
  if (entry.refCount > 0) return;

  // Non chiude subito: aspetta un breve periodo di grazia, così un rapido
  // smonta/rimonta (dovuto a re-render del provider React) non distrugge e
  // ricrea il canale, perdendo il track() già in corso
  entry.releaseTimer = setTimeout(() => {
    if (untrack) entry.channel.untrack();
    supabase.removeChannel(entry.channel);
    delete registry[campaignId];
  }, GRACE_PERIOD_MS);
}
