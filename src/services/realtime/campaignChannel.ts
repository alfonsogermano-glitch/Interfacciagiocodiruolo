import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '../../app/auth/AuthContext';

// Registro condiviso, a livello di modulo (non React), di canali Realtime
// con conteggio riferimenti. Risolve alla radice il bug trovato il
// 2026-07-20: piu' componenti (CampaignHome, SessionCharactersPanel,
// SessionNotesPanel, useEntityTabs) aprivano indipendentemente
// supabase.channel('campaign:{id}', ...) per lo stesso topic. RealtimeClient
// riusa la stessa istanza per uno stesso topic (confermato nel sorgente di
// @supabase/realtime-js), quindi due useEffect scoordinati - ciascuno con
// il proprio ciclo di vita (mount/unmount/retry) - finivano per litigarsi
// lo stesso canale: la cleanup dell'uno chiudeva il canale sotto ai piedi
// dell'altro, e un retry che ri-registrava .on(...) su un canale già
// sottoscritto lanciava "cannot add X callbacks... after subscribe()".
//
// Qui invece un solo punto possiede davvero il canale per ogni topic: il
// primo consumer lo crea, i successivi si limitano a registrarsi/
// deregistrarsi in un registro di callback interno (mai piu' .on() dopo il
// subscribe), e il canale viene chiuso per davvero solo quando l'ultimo
// consumer se ne va.

type BroadcastEvent = 'INSERT' | 'UPDATE' | 'DELETE' | 'session_change' | 'members_change' | 'notes_change';
const KNOWN_BROADCAST_EVENTS: BroadcastEvent[] = ['INSERT', 'UPDATE', 'DELETE', 'session_change', 'members_change', 'notes_change'];

type BroadcastHandler = (msg: any) => void;
type PresenceHandler = (state: Record<string, any>) => void;
type ReadyHandler = (ready: boolean) => void;

interface ChannelEntry {
  channel: ReturnType<typeof supabase.channel> | null;
  refCount: number;
  isActive: boolean;
  isReady: boolean;
  broadcastListeners: Map<BroadcastEvent, Set<BroadcastHandler>>;
  presenceListeners: Set<PresenceHandler>;
  readyListeners: Set<ReadyHandler>;
  retryTimeout: ReturnType<typeof setTimeout> | null;
  retryCount: number;
  hasScheduledRetry: boolean;
  subscribeChannel: () => Promise<void>;
}

const registry = new Map<string, ChannelEntry>();
const MAX_RETRIES = 5;

function setReady(entry: ChannelEntry, ready: boolean) {
  entry.isReady = ready;
  safeForEach(entry.readyListeners, ready, 'ready');
}

// Un registro condiviso da più consumer indipendenti non deve mai lasciare
// che un'eccezione in UN callback interrompa la consegna dell'evento agli
// altri - un bug (o anche solo un errore transitorio) in un singolo
// consumer non deve poter silenziosamente "spegnere" gli aggiornamenti per
// tutti gli altri. Principio generale, non una toppa per un bug specifico:
// ogni invocazione di un listener passa da qui, isolata individualmente.
function safeForEach<T>(listeners: Set<(arg: T) => void> | undefined, arg: T, label: string) {
  listeners?.forEach((cb) => {
    try {
      cb(arg);
    } catch (err) {
      console.error(`[campaignChannel] errore in un listener "${label}" (isolato, non ha bloccato gli altri):`, err);
    }
  });
}

function createEntry(topic: string): ChannelEntry {
  const entry: ChannelEntry = {
    channel: null,
    refCount: 0,
    isActive: true,
    isReady: false,
    broadcastListeners: new Map(KNOWN_BROADCAST_EVENTS.map((e) => [e, new Set<BroadcastHandler>()])),
    presenceListeners: new Set(),
    readyListeners: new Set(),
    retryTimeout: null,
    retryCount: 0,
    hasScheduledRetry: false,
    subscribeChannel: async () => {},
  };

  // Stesso pattern di retry con hasScheduledRetry corretto il 2026-07-19
  // (si azzera ad ogni SUBSCRIBED, a differenza del vecchio "settled" che
  // restava true e bloccava per sempre il retry di un canale morto più
  // tardi) - scritto una sola volta qui invece di essere ri-copiato in
  // ogni consumer.
  const subscribeChannel = async () => {
    if (!entry.isActive) return;
    await supabase.realtime.setAuth();
    if (!entry.isActive) return;

    let builder = supabase.channel(topic, { config: { private: true } });
    for (const event of KNOWN_BROADCAST_EVENTS) {
      builder = builder.on('broadcast', { event }, (msg: any) => {
        safeForEach(entry.broadcastListeners.get(event), msg, `broadcast:${event}`);
      });
    }
    builder = builder.on('presence', { event: 'sync' }, () => {
      const state = entry.channel?.presenceState() ?? {};
      safeForEach(entry.presenceListeners, state, 'presence:sync');
    });

    const ch = builder.subscribe((status: string) => {
      if (!entry.isActive) return;

      if (status === 'SUBSCRIBED') {
        entry.retryCount = 0;
        entry.hasScheduledRetry = false;
        setReady(entry, true);
        return;
      }
      if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
        setReady(entry, false);
        if (entry.hasScheduledRetry) return;
        entry.hasScheduledRetry = true;
        (async () => {
          try {
            await supabase.removeChannel(ch);
          } catch { /* ignora */ }
          if (!entry.isActive) return;
          if (entry.retryCount >= MAX_RETRIES) return;
          entry.retryCount += 1;
          entry.retryTimeout = setTimeout(() => { if (entry.isActive) subscribeChannel(); }, 1000);
        })();
      }
    });

    entry.channel = ch;
  };

  entry.subscribeChannel = subscribeChannel;
  subscribeChannel();
  return entry;
}

function acquireChannel(topic: string): ChannelEntry {
  let entry = registry.get(topic);
  if (!entry) {
    entry = createEntry(topic);
    registry.set(topic, entry);
  }
  entry.refCount += 1;
  return entry;
}

function releaseChannel(topic: string) {
  const entry = registry.get(topic);
  if (!entry) return;
  entry.refCount -= 1;
  if (entry.refCount <= 0) {
    entry.isActive = false;
    if (entry.retryTimeout) clearTimeout(entry.retryTimeout);
    if (entry.channel) { try { supabase.removeChannel(entry.channel); } catch { /* ignora */ } }
    registry.delete(topic);
  }
}

export interface UseRealtimeChannelOptions {
  onBroadcast?: Partial<Record<BroadcastEvent, BroadcastHandler>>;
  onPresenceSync?: PresenceHandler;
}

export interface UseRealtimeChannelResult {
  isReady: boolean;
  track: (payload: Record<string, unknown>) => Promise<void>;
  untrack: () => Promise<void>;
  send: (event: BroadcastEvent, payload: Record<string, unknown>) => Promise<void>;
  presenceState: () => Record<string, any>;
}

/**
 * Sottoscrive un canale Realtime condiviso per il topic indicato. Più
 * componenti che chiamano questo hook con lo stesso topic condividono la
 * stessa istanza di canale (conteggio riferimenti): nessuno di loro chiama
 * mai supabase.channel()/.on()/.subscribe() in prima persona.
 */
export function useRealtimeChannel(topic: string | null | undefined, options: UseRealtimeChannelOptions = {}): UseRealtimeChannelResult {
  const optionsRef = useRef(options);
  optionsRef.current = options;

  const entryRef = useRef<ChannelEntry | null>(null);
  const [isReady, setIsReady] = useState(false);

  useEffect(() => {
    if (!topic) return;
    const entry = acquireChannel(topic);
    entryRef.current = entry;
    setIsReady(entry.isReady);

    const unregisterFns: Array<() => void> = [];

    for (const event of KNOWN_BROADCAST_EVENTS) {
      const handler: BroadcastHandler = (msg) => { optionsRef.current.onBroadcast?.[event]?.(msg); };
      const set = entry.broadcastListeners.get(event)!;
      set.add(handler);
      unregisterFns.push(() => set.delete(handler));
    }

    const presenceHandler: PresenceHandler = (state) => { optionsRef.current.onPresenceSync?.(state); };
    entry.presenceListeners.add(presenceHandler);
    unregisterFns.push(() => entry.presenceListeners.delete(presenceHandler));

    const readyHandler: ReadyHandler = (ready) => setIsReady(ready);
    entry.readyListeners.add(readyHandler);
    unregisterFns.push(() => entry.readyListeners.delete(readyHandler));

    return () => {
      unregisterFns.forEach((fn) => fn());
      entryRef.current = null;
      releaseChannel(topic);
    };
  }, [topic]);

  const track = useCallback(async (payload: Record<string, unknown>) => {
    const ch = entryRef.current?.channel;
    if (ch) await ch.track(payload);
  }, []);

  const untrack = useCallback(async () => {
    const ch = entryRef.current?.channel;
    if (ch) await ch.untrack();
  }, []);

  const send = useCallback(async (event: BroadcastEvent, payload: Record<string, unknown>) => {
    const ch = entryRef.current?.channel;
    if (ch) await ch.send({ type: 'broadcast', event, payload });
  }, []);

  const presenceState = useCallback(() => entryRef.current?.channel?.presenceState() ?? {}, []);

  return { isReady, track, untrack, send, presenceState };
}

/** Convenience wrapper: stesso hook, topic già formattato per una campagna. */
export function useCampaignChannel(campaignId: string | null | undefined, options: UseRealtimeChannelOptions = {}): UseRealtimeChannelResult {
  return useRealtimeChannel(campaignId ? `campaign:${campaignId}` : null, options);
}
