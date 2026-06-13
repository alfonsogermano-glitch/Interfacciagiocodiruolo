/**
 * Configurazione Supabase
 *
 * Durante lo sviluppo in Figma Make:
 * - Inserisci le tue credenziali qui sotto
 *
 * Quando esporti il progetto:
 * - Le credenziali verranno lette da import.meta.env
 */

// 🔐 INSERISCI LE TUE CREDENZIALI QUI (solo per sviluppo)
// Trova queste credenziali in: Supabase Dashboard → Settings → API
export const SUPABASE_CONFIG = {
  // Project URL (es: https://xyzabc123.supabase.co)
  url: 'https://njcnkovruynhtsgzgrxi.supabase.co',

  // Anon/Public Key (la chiave che inizia con eyJ...)
  anonKey: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5qY25rb3ZydXluaHRzZ3pncnhpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzY0MzQ4NDgsImV4cCI6MjA5MjAxMDg0OH0.Gj7ed9YZv7D56SOZkQ5StYnIYycxTMSCE6Ro31YFzo8',
};

/**
 * Usa le variabili d'ambiente se disponibili (dopo export),
 * altrimenti usa le credenziali hardcoded (durante sviluppo)
 */
export function getSupabaseConfig() {
  const envUrl = import.meta.env?.VITE_SUPABASE_URL;
  const envKey = import.meta.env?.VITE_SUPABASE_ANON_KEY;

  return {
    url: envUrl || SUPABASE_CONFIG.url,
    anonKey: envKey || SUPABASE_CONFIG.anonKey,
  };
}
