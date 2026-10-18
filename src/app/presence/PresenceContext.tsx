import { createContext, useContext, useEffect, useState } from 'react';
import { registerBeforeSignOut, useAuth, supabase } from '../auth/AuthContext';
import { selectedContentMode } from '../../services/storage/persistenceMode';

type PresenceContextValue = {
  onlineProfileIds: Set<string>;
  isOnline: (profileId: string | null | undefined) => boolean;
};

const PresenceContext = createContext<PresenceContextValue | null>(null);

export function PresenceProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const [onlineProfileIds, setOnlineProfileIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!user?.id || selectedContentMode() === 'local') { setOnlineProfileIds(new Set()); return; }
    const channel = supabase.channel('online:all', { config: { private: false, presence: { key: user.id } } });
    const refreshPresence = () => { void channel.track({ profileId: user.id, online_at: new Date().toISOString() }); };
    const refreshWhenVisible = () => { if (document.visibilityState === 'visible') refreshPresence(); };
    const syncOnlineProfiles = () => {
      const ids = new Set<string>();
      Object.values(channel.presenceState()).forEach((presences: any) => presences.forEach((presence: any) => {
        if (typeof presence.profileId === 'string') ids.add(presence.profileId);
      }));
      setOnlineProfileIds(ids);
    };
    channel
      .on('presence', { event: 'sync' }, syncOnlineProfiles)
      .on('presence', { event: 'join' }, syncOnlineProfiles)
      .on('presence', { event: 'leave' }, syncOnlineProfiles)
      .subscribe(status => {
      if (status === 'SUBSCRIBED') refreshPresence();
    });
    document.addEventListener('visibilitychange', refreshWhenVisible);
    window.addEventListener('focus', refreshPresence);
    window.addEventListener('online', refreshPresence);
    const unregisterBeforeSignOut = registerBeforeSignOut(async () => { await channel.untrack(); });
    return () => {
      unregisterBeforeSignOut();
      document.removeEventListener('visibilitychange', refreshWhenVisible);
      window.removeEventListener('focus', refreshPresence);
      window.removeEventListener('online', refreshPresence);
      void (async () => {
        try { await channel.untrack(); } finally { await supabase.removeChannel(channel); }
      })();
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
