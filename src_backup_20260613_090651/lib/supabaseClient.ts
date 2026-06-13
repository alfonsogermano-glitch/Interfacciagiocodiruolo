import { createClient } from '@supabase/supabase-js';
import { getSupabaseConfig } from '../config/supabase.config';

const config = getSupabaseConfig();

export const isSupabaseConfigured = Boolean(config.url && config.anonKey);

export const supabase = isSupabaseConfigured
  ? createClient(config.url, config.anonKey)
  : null;