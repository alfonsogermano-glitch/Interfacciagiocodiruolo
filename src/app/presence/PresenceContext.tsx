import { createContext, useContext, useEffect, useState } from 'react';
import { supabase, useAuth } from '../auth/AuthContext';

type PresenceContextValue = {
  onlineProfileIds: Set<string>;
  isOnline: (profileId: string | null | undefined) => boolean;
};

const PresenceContext = createContext<PresenceContextValue | null>(null);

// Presenza globale ("loggato su Hollow Gate ora", non "dentro questa
// campagna") - canale Realtime condiviso da tutti gli utenti (non uno per
// utente: Presence e' pensato per N tracker su un canale, non N canali da
// osservare), stesso pattern gia' usato 8 volte nel codice per
// campaign:{id} (vedi es. MyCharactersPage.tsx), solo con scope globale
// invece che per-campagna. Cleanup al logout gia' gratis: signOut() in
// AuthContext.tsx chiama supabase.removeAllChannels() prima di
// supabase.auth.signOut(), nessuna logica dedicata necessaria qui.
export function PresenceProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const [onlineProfileIds, setOnlineProfileIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!user) {
      setOnlineProfileIds(new Set());
      return;
    }

    let cancelled = false;
    let ch: ReturnType<typeof supabase.channel> | null = null;

    (async () => {
      // Necessario per l'autorizzazione sui canali privati (stesso
      // requisito gia' documentato in PlayerCharacters.tsx/useEntityTabs.ts
      // per campaign:{id}) - senza questa chiamata il subscribe fallisce
      // con CHANNEL_ERROR anche con le policy RLS su realtime.messages
      // gia' presenti.
      await supabase.realtime.setAuth();
      if (cancelled) return;

      const channel = supabase
        .channel('online:all', { config: { private: true } })
        .on('presence', { event: 'sync' }, () => {
          const state = channel.presenceState();
          const ids = new Set<string>();
          Object.values(state).forEach((presences: any) => {
            presences.forEach((p: any) => {
              if (p.profileId) ids.add(p.profileId);
            });
          });
          setOnlineProfileIds(ids);
          console.log('[online:all debug]', Array.from(ids));
        })
        .subscribe(async (status) => {
          console.log('[online:all debug] subscribe status', status);
          if (status === 'SUBSCRIBED' && !cancelled) {
            await channel.track({ profileId: user.id, online_at: new Date().toISOString() });
          }
        });

      ch = channel;
    })();

    return () => {
      cancelled = true;
      if (ch) supabase.removeChannel(ch);
    };
  }, [user?.id]);

  return (
    <PresenceContext.Provider value={{
      onlineProfileIds,
      isOnline: (profileId) => !!profileId && onlineProfileIds.has(profileId),
    }}>
      {children}
    </PresenceContext.Provider>
  );
}

export function useOnlinePresence(): PresenceContextValue {
  const ctx = useContext(PresenceContext);
  if (!ctx) throw new Error('useOnlinePresence deve essere usato dentro PresenceProvider');
  return ctx;
}
