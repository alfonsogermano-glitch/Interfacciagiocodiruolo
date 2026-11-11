import { useEffect, useState } from 'react';
import { createGmHostReactBridge, type GmHostRole } from './gmHostReactBridge';

// Experimental opt-in only. No automatic takeover of campaignChannel or Supabase.
// Credentials must come from an authenticated joining flow, never hardcoded in React.
export function useGmHostSession(config: {
  enabled: boolean;
  role: GmHostRole;
  token: string | null;
  origin: string;
}) {
  const [session, setSession] = useState<ReturnType<ReturnType<typeof createGmHostReactBridge>['getSnapshot']>>({
    status: 'idle', sequence: -1, scene: null, tokens: [], error: null,
  });
  useEffect(() => {
    if (!config.enabled || !config.token) {
      setSession({ status: 'idle', sequence: -1, scene: null, tokens: [], error: null });
      return;
    }
    const bridge = createGmHostReactBridge({
      role: config.role,
      token: config.token,
      origin: config.origin,
    });
    const unsubscribe = bridge.subscribe(setSession);
    bridge.connect();
    return () => { unsubscribe(); bridge.dispose(); };
  }, [config.enabled, config.role, config.token, config.origin]);
  return session;
}
