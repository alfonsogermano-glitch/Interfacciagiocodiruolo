import { createContext, useContext, useEffect, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import { projectId, publicAnonKey } from '/utils/supabase/info';
import { supabase as _supabaseClient } from '../../lib/supabaseClient';

const SUPABASE_URL = `https://${projectId}.supabase.co`;
const SERVER_BASE = `${SUPABASE_URL}/functions/v1/make-server-771c5bfd`;

// Riusa il singleton da supabaseClient.ts per evitare istanze multiple
export const supabase = _supabaseClient!;

export type AuthUser = {
  id: string;
  email: string;
  displayName: string;
  avatarUrl?: string;
};

type AuthContextValue = {
  user: AuthUser | null;
  session: Session | null;
  isLoading: boolean;
  signIn: (email: string, password: string) => Promise<{ error: string | null }>;
  signUp: (email: string, password: string, displayName?: string) => Promise<{ error: string | null }>;
  signOut: () => Promise<void>;
  isPasswordRecovery: boolean;
  clearPasswordRecovery: () => void;
  refreshUser: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

function fallbackUserFromIdentities(session: Session): AuthUser {
  const identities = session.user.identities ?? [];
  const mostRecent = identities.length > 0
    ? [...identities].sort((a, b) =>
        new Date(b.updated_at ?? 0).getTime() - new Date(a.updated_at ?? 0).getTime()
      )[0]
    : null;

  const data = mostRecent?.identity_data ?? {};
  const provider = mostRecent?.provider ?? 'email';

  let displayName: string;
  let avatarUrl: string | undefined;

  if (provider === 'email') {
    displayName = session.user.user_metadata?.display_name ?? session.user.email ?? 'Utente';
    avatarUrl = undefined;
  } else {
    displayName =
      data.custom_claims?.global_name ??
      data.full_name ??
      data.name ??
      data.nickname ??
      session.user.email ??
      'Utente';
    avatarUrl = data.avatar_url ?? data.picture ?? undefined;
  }

  return { id: session.user.id, email: session.user.email ?? '', displayName, avatarUrl };
}

async function buildUserFromSession(session: Session): Promise<AuthUser> {
  const { data: profile, error } = await supabase
    .from('profiles')
    .select('display_name, avatar_url, email')
    .eq('id', session.user.id)
    .maybeSingle();

  if (error || !profile) {
    console.log('Profilo non trovato a DB, uso fallback da identities:', error?.message);
    return fallbackUserFromIdentities(session);
  }

  return {
    id: session.user.id,
    email: profile.email ?? session.user.email ?? '',
    displayName: profile.display_name,
    avatarUrl: profile.avatar_url ?? undefined,
  };
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<AuthUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isPasswordRecovery, setIsPasswordRecovery] = useState(false);

  useEffect(() => {
    let isMounted = true;

    // Timeout di sicurezza: se il recupero della sessione resta sospeso
    // (rete lenta, richiesta che non risponde mai), l'app procede comunque
    // dopo 8 secondi invece di restare bloccata sullo spinner per sempre.
    const safetyTimeout = setTimeout(() => {
      if (isMounted) setIsLoading(false);
    }, 8000);

    supabase.auth.getSession()
      .then(async ({ data: { session: existingSession } }) => {
        if (!isMounted) return;
        setSession(existingSession);
        setUser(existingSession ? await buildUserFromSession(existingSession) : null);
      })
      .catch((err) => {
        console.log('Errore nel recupero della sessione iniziale:', err);
      })
      .finally(() => {
        clearTimeout(safetyTimeout);
        if (isMounted) setIsLoading(false);
      });

    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, nextSession) => {
      if (event === 'PASSWORD_RECOVERY') {
        const hash = window.location.hash;
        if (hash.includes('type=recovery')) {
          setIsPasswordRecovery(true);
          window.history.replaceState(null, '', window.location.pathname + window.location.search);
        }
      }
      if (!isMounted) return;
      try {
        setSession(nextSession);
        setUser(nextSession ? await buildUserFromSession(nextSession) : null);
      } catch (err) {
        console.log('Errore nella gestione del cambio di stato auth:', err);
      } finally {
        if (isMounted) setIsLoading(false);
      }
    });

    return () => {
      isMounted = false;
      clearTimeout(safetyTimeout);
      subscription.unsubscribe();
    };
  }, []);

  const signIn = async (email: string, password: string): Promise<{ error: string | null }> => {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) {
      console.log('Errore login:', error.message);
      return { error: error.message };
    }
    return { error: null };
  };

  const signUp = async (
    email: string,
    password: string,
    displayName?: string
  ): Promise<{ error: string | null }> => {
    try {
      const response = await fetch(`${SERVER_BASE}/auth/signup`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${publicAnonKey}`,
        },
        body: JSON.stringify({ email, password, displayName }),
      });

      const data = await response.json();

      if (!response.ok) {
        console.log('Errore registrazione:', data.error);
        return { error: data.error ?? 'Errore durante la registrazione' };
      }

      // Auto-login dopo registrazione riuscita
      const { error: signInError } = await supabase.auth.signInWithPassword({ email, password });
      if (signInError) {
        return { error: signInError.message };
      }

      return { error: null };
    } catch (err) {
      console.log('Errore di rete signup:', err);
      return { error: `Errore di connessione: ${err}` };
    }
  };

  const signOut = async () => {
    try {
      await supabase.removeAllChannels();
    } catch (error) {
      console.error('Errore chiusura canali Realtime prima del logout:', error);
    }
    await supabase.auth.signOut();
  };

  const refreshUser = async () => {
    if (!session) return;
    setUser(await buildUserFromSession(session));
  };

  return (
    <AuthContext.Provider value={{
      user, session, isLoading, signIn, signUp, signOut,
      isPasswordRecovery,
      clearPasswordRecovery: () => {
        setIsPasswordRecovery(false);
        if (window.location.hash.includes('type=recovery')) {
          window.history.replaceState(null, '', window.location.pathname + window.location.search);
        }
      },
      refreshUser,
    }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth deve essere usato dentro AuthProvider');
  return ctx;
}
