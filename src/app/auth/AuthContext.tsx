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
};

const AuthContext = createContext<AuthContextValue | null>(null);

function sessionToUser(session: Session): AuthUser {
  return {
    id: session.user.id,
    email: session.user.email ?? '',
    displayName: session.user.user_metadata?.display_name ?? session.user.email ?? 'Utente',
  };
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<AuthUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isPasswordRecovery, setIsPasswordRecovery] = useState(false);

  useEffect(() => {
    // Carica sessione esistente
    supabase.auth.getSession().then(({ data: { session: existingSession } }) => {
      setSession(existingSession);
      setUser(existingSession ? sessionToUser(existingSession) : null);
      setIsLoading(false);
    });

    // Ascolta cambiamenti di stato auth
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, nextSession) => {
      if (event === 'PASSWORD_RECOVERY') {
        setIsPasswordRecovery(true);
      }
      setSession(nextSession);
      setUser(nextSession ? sessionToUser(nextSession) : null);
    });

    return () => subscription.unsubscribe();
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
    await supabase.auth.signOut();
  };

  return (
    <AuthContext.Provider value={{
      user, session, isLoading, signIn, signUp, signOut,
      isPasswordRecovery, clearPasswordRecovery: () => setIsPasswordRecovery(false),
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
