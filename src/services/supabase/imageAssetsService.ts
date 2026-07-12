import { supabase } from '../../lib/supabaseClient';

/**
 * Registro condiviso "Raccolta immagini": un asset per foto sorgente
 * caricata da un utente, riferibile da piu' entita' (characters/npcs/
 * monsters, tramite portrait_asset_id) - riferimento vivo, non copia: chi
 * modifica la sorgente la cambia per tutte le entita' che la referenziano.
 * Il ritaglio (crop) resta per-entita' (portrait_crop_area), non qui -
 * vedi supabase-add-image-assets.sql per lo schema completo.
 */
export interface ImageAsset {
  id: string;
  ownerProfileId: string;
  sourceImageUrl: string;
  createdAt?: string;
  updatedAt?: string;
}

function mapRowToImageAsset(row: any): ImageAsset {
  return {
    id: row.id,
    ownerProfileId: row.owner_profile_id,
    sourceImageUrl: row.source_image_url,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/** Tutti gli asset sorgente di un utente, piu' recenti prima - attraverso
 *  tutte le sue entita'/campagne, non filtrati per campaign_id (e' una
 *  raccolta personale, non di campagna: stesso asse di query di
 *  loadNPCsByOwner/loadMonstersByOwner in entitiesService.ts). Assente in
 *  modalita' locale, stesso limite gia' presente per quelle due funzioni:
 *  la raccolta incrocia entita' di campagne diverse, fuori dal modello a
 *  chiave campaignId+collection dello storage locale. */
export async function loadImageAssetsByOwner(ownerProfileId: string): Promise<ImageAsset[]> {
  if (!supabase) return [];

  const { data, error } = await supabase
    .from('image_assets')
    .select('*')
    .eq('owner_profile_id', ownerProfileId)
    .order('updated_at', { ascending: false });

  if (error) {
    console.error('Errore caricamento raccolta immagini:', error);
    return [];
  }

  return (data || []).map(mapRowToImageAsset);
}

/**
 * Crea o aggiorna l'asset sorgente di un'entita' dopo la conferma di una
 * nuova foto in ImageCropCore. Se existingAssetId e' presente aggiorna
 * quella riga in place (source_image_url sostituita per tutte le entita'
 * che la referenziano, condivisa o no - riferimento vivo per costruzione,
 * nessuna diramazione su "quante altre la usano"); altrimenti ne inserisce
 * una nuova. Ritorna l'id da salvare in portrait_asset_id sull'entita'
 * chiamante, o null in modalita' locale/errore (l'entita' resta sul
 * comportamento attuale non condiviso, nessun collegamento creato).
 */
export async function saveImageAssetSource(params: {
  existingAssetId?: string | null;
  ownerProfileId: string;
  sourceImageUrl: string;
}): Promise<string | null> {
  if (!supabase) return null;

  const { existingAssetId, ownerProfileId, sourceImageUrl } = params;

  if (existingAssetId) {
    const { error } = await supabase
      .from('image_assets')
      .update({ source_image_url: sourceImageUrl })
      .eq('id', existingAssetId);

    if (error) {
      console.error('Errore aggiornamento asset immagine condiviso:', error);
    }
    return existingAssetId;
  }

  const { data, error } = await supabase
    .from('image_assets')
    .insert({ owner_profile_id: ownerProfileId, source_image_url: sourceImageUrl })
    .select('id')
    .single();

  if (error || !data) {
    console.error('Errore creazione asset immagine condiviso:', error);
    return null;
  }

  return data.id;
}
