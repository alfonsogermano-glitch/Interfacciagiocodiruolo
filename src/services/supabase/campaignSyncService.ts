import { supabase } from '../../lib/supabaseClient';
import { readDashboardSettings } from '../settings/dashboardSettings';
import type { RulesetId } from '../../app/campaigns/campaignTypes';

/**
 * Garantisce che esista una riga nella tabella SQL `campaigns` per l'id indicato.
 *
 * Le campagne create dalla HomeScreen vengono salvate solo nel KV store
 * dell'edge function: senza una riga corrispondente in `campaigns`, ogni
 * salvataggio di entità (mostri, PNG, luoghi, avventure, ecc.) fallisce per
 * violazione del vincolo `*_campaign_id_fkey`. Questa funzione crea quella
 * riga in modo idempotente (ON CONFLICT DO NOTHING) prima di entrare in Dashboard.
 */

interface CampaignSyncData {
  name: string;
  description?: string;
  ruleset?: RulesetId;
  ownerId: string;
}

function shouldUseLocalMode(): boolean {
  const settings = readDashboardSettings();
  return settings.saveMode === 'local' || !supabase;
}

const syncedCampaignIds = new Set<string>();

export async function ensureCampaignExistsInDB(
  campaignId: string,
  campaign: CampaignSyncData
): Promise<void> {
  if (shouldUseLocalMode() || !supabase) return;
  if (syncedCampaignIds.has(campaignId)) return;

  const basePayload = {
    id: campaignId,
    name: campaign.name,
    description: campaign.description ?? null,
    owner_profile_id: campaign.ownerId
  };

  const { error } = await supabase
    .from('campaigns')
    .upsert(
      { ...basePayload, ruleset: campaign.ruleset ?? null },
      { onConflict: 'id', ignoreDuplicates: true }
    );

  if (error) {
    // Se la colonna `ruleset` non esiste ancora (migrazione non eseguita),
    // riprova senza quel campo per non bloccare l'ingresso in Dashboard.
    if (error.code === 'PGRST204' && error.message.includes("'ruleset'")) {
      const { error: retryError } = await supabase
        .from('campaigns')
        .upsert(basePayload, { onConflict: 'id', ignoreDuplicates: true });

      if (retryError) {
        console.warn('Errore sincronizzazione campagna (senza ruleset):', retryError);
        return;
      }

      syncedCampaignIds.add(campaignId);
      return;
    }

    console.warn('Errore sincronizzazione campagna nel DB:', error);
    return;
  }

  syncedCampaignIds.add(campaignId);
}
