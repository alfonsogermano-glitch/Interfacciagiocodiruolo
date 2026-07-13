import { supabase } from '../../lib/supabaseClient';
import type { CropAreaPercent } from '../../app/components/shared/SourceCroppedImage';

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

/** Crop "intero quadrato, centrato" - usato per le miniature della
 *  raccolta (che mostrano la sorgente cosi' com'e', non il crop di
 *  nessuna entita' specifica) e come fallback quando nessuna entita'
 *  propria referenzia ancora l'asset scelto (vedi
 *  findReferenceCropAreaForAsset). */
export const DEFAULT_ASSET_CROP_AREA: CropAreaPercent = { x: 0, y: 0, width: 100, height: 100 };

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

/**
 * Cerca un'entita' propria (characters/npcs/monsters, in quest'ordine) che
 * referenzia gia' l'asset scelto, per riusarne il crop come punto di
 * partenza - il crop e' per-design per-entita' (Fase 1: entita' diverse
 * possono inquadrare la stessa sorgente in modo diverso, es. Token Studio
 * con forme diverse), quindi non e' salvato sulla riga image_assets stessa
 * e va cercato al momento della selezione nel picker. Ritorna il primo
 * trovato, o null se nessuna entita' lo referenzia ancora (primo utilizzo -
 * il chiamante ripiega su DEFAULT_ASSET_CROP_AREA).
 */
export async function findReferenceCropAreaForAsset(assetId: string): Promise<CropAreaPercent | null> {
  if (!supabase) return null;

  const tables = ['characters', 'npcs', 'monsters'] as const;
  for (const table of tables) {
    const { data, error } = await supabase
      .from(table)
      .select('portrait_crop_area')
      .eq('portrait_asset_id', assetId)
      .not('portrait_crop_area', 'is', null)
      .limit(1)
      .maybeSingle();

    if (error) {
      console.error(`Errore ricerca crop di riferimento su ${table}:`, error);
      continue;
    }
    if (data?.portrait_crop_area) {
      return data.portrait_crop_area as CropAreaPercent;
    }
  }

  return null;
}

/**
 * Come findReferenceCropAreaForAsset, ma per piu' asset in un colpo solo -
 * usata dalla griglia di ImageAssetPicker, dove interrogare un asset alla
 * volta (N asset -> fino a 3N query, una per tabella) scalerebbe male.
 * Stessa priorita' characters->npcs->monsters e stesso criterio "primo
 * trovato": una tabella viene interrogata solo per gli assetId ancora senza
 * crop (filtrati via via), quindi restano al massimo 3 query totali
 * indipendentemente da N. Assenti dalla mappa risultato gli asset non
 * ancora referenziati da nessuna entita' propria (il chiamante ripiega su
 * DEFAULT_ASSET_CROP_AREA).
 */
export async function findReferenceCropAreasForAssets(assetIds: string[]): Promise<Map<string, CropAreaPercent>> {
  const result = new Map<string, CropAreaPercent>();
  if (!supabase || assetIds.length === 0) return result;

  const tables = ['characters', 'npcs', 'monsters'] as const;
  for (const table of tables) {
    const remaining = assetIds.filter(id => !result.has(id));
    if (remaining.length === 0) break;

    const { data, error } = await supabase
      .from(table)
      .select('portrait_asset_id, portrait_crop_area')
      .in('portrait_asset_id', remaining)
      .not('portrait_crop_area', 'is', null);

    if (error) {
      console.error(`Errore ricerca crop di riferimento su ${table}:`, error);
      continue;
    }

    for (const row of data || []) {
      if (row.portrait_asset_id && row.portrait_crop_area && !result.has(row.portrait_asset_id)) {
        result.set(row.portrait_asset_id, row.portrait_crop_area as CropAreaPercent);
      }
    }
  }

  return result;
}
