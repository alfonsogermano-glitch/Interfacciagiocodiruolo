import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '../../app/auth/AuthContext';
import { selectedContentMode } from '../storage/persistenceMode';
import { KNOWN_BROADCAST_EVENTS, type BroadcastEvent } from './campaignChannelContract';

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

// Shared transport-neutral event contract used unchanged by the original
// channel and, later, by an authenticated Aruba GM-host relay.

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
  desiredPresence: Record<string, unknown> | null;
  presenceQueue: Promise<void>;
  subscribeChannel: () => Promise<void>;
}

const registry = new Map<string, ChannelEntry>();

function setReady(entry: ChannelEntry, ready: boolean) {
  entry.isReady = ready;
  safeForEach(entry.readyListeners, ready, 'ready');
}

function reconcilePresence(entry: ChannelEntry) {
  entry.presenceQueue = entry.presenceQueue
    .then(async () => {
      const channel = entry.channel;
      if (!entry.isActive || !entry.isReady || !channel) return;
      if (entry.desiredPresence) await channel.track(entry.desiredPresence);
      else await channel.untrack();
    })
    .catch((error) => {
      console.error('[campaignChannel] errore aggiornamento Presence:', error);
    });
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
    desiredPresence: null,
    presenceQueue: Promise.resolve(),
    subscribeChannel: async () => {},
  };

  // Stesso pattern di retry con hasScheduledRetry corretto il 2026-07-19
  // (si azzera ad ogni SUBSCRIBED, a differenza del vecchio "settled" che
  // restava true e bloccava per sempre il retry di un canale morto più
  // tardi) - scritto una sola volta qui invece di essere ri-copiato in
  // ogni consumer.
  const subscribeChannel = async () => {
    if (!entry.isActive) return;
    // Modalita' Locale: nessuna connessione Realtime, i canali sono locali
    // (topic di campagna e profilo convivono sullo stesso dispositivo).
    if (selectedContentMode() === 'local') {
      setReady(entry, true);
      return;
    }
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
        reconcilePresence(entry);
        return;
      }
      if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
        setReady(entry, false);
        safeForEach(entry.presenceListeners, {}, 'presence:disconnected');
        if (entry.hasScheduledRetry) return;
        entry.hasScheduledRetry = true;
        (async () => {
          try {
            await supabase.removeChannel(ch);
          } catch {
            /* ignora */
          }
          if (!entry.isActive) return;
          entry.retryCount += 1;
          const retryDelay = Math.min(30_000, 1000 * 2 ** Math.min(entry.retryCount - 1, 5)) + Math.round(Math.random() * 500);
          entry.retryTimeout = setTimeout(() => {
            entry.retryTimeout = null;
            entry.hasScheduledRetry = false;
            if (entry.isActive) subscribeChannel();
          }, retryDelay);
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
    if (entry.channel) {
      try {
        supabase.removeChannel(entry.channel);
      } catch {
        /* ignora */
      }
    }
    registry.delete(topic);
  }
}

export interface UseRealtimeChannelOptions {
  onBroadcast?: Partial<Record<BroadcastEvent, BroadcastHandler>>;
  onPresenceSync?: PresenceHandler;
  presence?: Record<string, unknown> | null;
}

export interface UseRealtimeChannelResult {
  isReady: boolean;
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
    if (optionsRef.current.presence !== undefined) {
      entry.desiredPresence = optionsRef.current.presence;
      reconcilePresence(entry);
    }
    setIsReady(entry.isReady);

    const unregisterFns: Array<() => void> = [];

    for (const event of KNOWN_BROADCAST_EVENTS) {
      const handler: BroadcastHandler = (msg) => {
        optionsRef.current.onBroadcast?.[event]?.(msg);
      };
      const set = entry.broadcastListeners.get(event)!;
      set.add(handler);
      unregisterFns.push(() => set.delete(handler));
    }

    const presenceHandler: PresenceHandler = (state) => {
      optionsRef.current.onPresenceSync?.(state);
    };
    entry.presenceListeners.add(presenceHandler);
    // Un consumer aperto dopo il sync (es. la chat) deve ricevere subito
    // la fotografia già disponibile, senza attendere una nuova join/leave.
    safeForEach(new Set([presenceHandler]), entry.channel?.presenceState() ?? {}, 'presence:snapshot');
    unregisterFns.push(() => entry.presenceListeners.delete(presenceHandler));

    const readyHandler: ReadyHandler = (ready) => setIsReady(ready);
    entry.readyListeners.add(readyHandler);
    unregisterFns.push(() => entry.readyListeners.delete(readyHandler));

    return () => {
      if (optionsRef.current.presence !== undefined) {
        entry.desiredPresence = null;
        reconcilePresence(entry);
      }
      unregisterFns.forEach((fn) => fn());
      entryRef.current = null;
      releaseChannel(topic);
    };
  }, [topic]);

  const presenceSignature = JSON.stringify(options.presence);
  useEffect(() => {
    const entry = entryRef.current;
    if (!entry || optionsRef.current.presence === undefined) return;
    entry.desiredPresence = optionsRef.current.presence;
    reconcilePresence(entry);
  }, [topic, presenceSignature]);

  const send = useCallback(
    async (event: BroadcastEvent, payload: Record<string, unknown>) => {
      if (selectedContentMode() === 'local') {
        safeForEach(entryRef.current?.broadcastListeners.get(event), { payload }, `local:${event}`);
        return;
      }
      const ch = entryRef.current?.channel;
      if (!ch) return;
      // Diagnostica per la sessione live: un broadcast rifiutato (limite
      // eventi/sec o payload troppo grande per il piano) era prima silenzioso
      // e si manifestava solo come "aggiornamento non arrivato" sugli altri
      // schermi. I payload degli snapshot completi sono gli unici che possono
      // avvicinarsi al limite di 256KB del piano Free.
      if (event === 'active_scene_change') {
        const size = JSON.stringify(payload)?.length ?? 0;
        if (size > 200 * 1024) {
          console.warn(`[campaignChannel] broadcast "${event}" pesante: ${Math.round(size / 1024)}KB (limite piano Free: 256KB).`);
        }
      }
      try {
        const result = await ch.send({ type: 'broadcast', event, payload });
        if (result !== 'ok') {
          console.warn(`[campaignChannel] invio broadcast "${event}" non riuscito: ${result}`);
        }
      } catch (error) {
        console.warn(`[campaignChannel] errore invio broadcast "${event}":`, error);
      }
    },
    [topic],
  );

  const presenceState = useCallback(() => entryRef.current?.channel?.presenceState() ?? {}, []);

  return { isReady, send, presenceState };
}

/** Convenience wrapper: stesso hook, topic già formattato per una campagna. */
export function useCampaignChannel(campaignId: string | null | undefined, options: UseRealtimeChannelOptions = {}): UseRealtimeChannelResult {
  return useRealtimeChannel(campaignId ? `campaign:${campaignId}` : null, options);
}
