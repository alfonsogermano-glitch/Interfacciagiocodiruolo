import { createClient } from '@supabase/supabase-js';
import { getSupabaseConfig } from '../config/supabase.config';

const config = getSupabaseConfig();

export const isSupabaseConfigured = Boolean(config.url && config.anonKey);

// Workaround per un bug documentato di supabase-js: il meccanismo interno di
// "lock" tra tab (basato su navigator.locks) può bloccarsi indefinitamente
// dopo aver chiuso e riaperto il browser con una sessione già salvata.
// Sostituendolo con un lock "no-op" (che esegue subito la funzione senza
// fare la mutua esclusione tra tab), il blocco non può più verificarsi.
// Riferimento: https://github.com/supabase/supabase-js/issues/1594
const noOpLock = async <R>(_name: string, _acquireTimeout: number, fn: () => Promise<R>): Promise<R> => {
  return await fn();
};

export const supabase = isSupabaseConfigured
  ? createClient(config.url, config.anonKey, {
      auth: {
        lock: noOpLock,
      },
    })
  : null;
