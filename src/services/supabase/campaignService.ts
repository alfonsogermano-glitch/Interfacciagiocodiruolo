import { supabase } from '../../lib/supabaseClient';

export interface Campaign {
  id: string;
  name: string;
  description?: string;
  drama: number;
  owner_profile_id: string;
  created_at?: string;
  updated_at?: string;
}

/**
 * Ottiene o crea la campagna di default
 */
export async function ensureDefaultCampaign(campaignId: string): Promise<Campaign> {
  if (!supabase) throw new Error('Supabase non configurato');

  // Prova a recuperare la campagna esistente
  const { data: existing, error: fetchError } = await supabase
    .from('campaigns')
    .select('*')
    .eq('id', campaignId)
    .single();

  if (existing) {
    return existing;
  }

  // Se non esiste, creala
  const { data: newCampaign, error: createError } = await supabase
    .from('campaigns')
    .insert({
      id: campaignId,
      name: DEFAULT_CAMPAIGN_NAME,
      description: DEFAULT_CAMPAIGN_DESCRIPTION,
      drama: 1,
      owner_profile_id: 'demo-user'
    })
    .select()
    .single();

  if (createError) throw createError;
  return newCampaign;
}

/**
 * Aggiorna il livello di Drama
 */
export async function updateDrama(campaignId: string, drama: number): Promise<void> {
  if (!supabase) throw new Error('Supabase non configurato');

  const { error } = await supabase
    .from('campaigns')
    .update({ drama })
    .eq('id', campaignId);

  if (error) throw error;
}

/**
 * Ottiene il livello di Drama corrente
 */
export async function getDrama(campaignId: string): Promise<number> {
  if (!supabase) throw new Error('Supabase non configurato');

  const { data, error } = await supabase
    .from('campaigns')
    .select('drama')
    .eq('id', campaignId)
    .single();

  if (error) throw error;
  return data.drama;
}
