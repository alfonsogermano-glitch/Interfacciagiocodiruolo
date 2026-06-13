import { supabase } from '../../lib/supabaseClient';
import { DEFAULT_CAMPAIGN_ID } from '../../config/campaign.config';
import { CAMPAIGN_STORAGE_KEYS } from './campaignStorageKeys';

type RawReference = {
  id?: string;
  name?: string;
  title?: string;
  campaignId?: string | null;
  campaign_id?: string | null;
  adventureId?: string | null;
  adventure_id?: string | null;
  parentLocationId?: string | null;
  parent_location_id?: string | null;
};

export type EntityReference = {
  id: string;
  name: string;
  campaignId: string | null;
  adventureId?: string | null;
  parentLocationId?: string | null;
};

export type EntityReferenceBundle = {
  environments: EntityReference[];
  npcs: EntityReference[];
  monsters: EntityReference[];
  equipment: EntityReference[];
};

function normalizeReferences(
  items: RawReference[],
  campaignId = DEFAULT_CAMPAIGN_ID
): EntityReference[] {
  return items
    .filter(item => item.id)
    .map(item => ({
      id: String(item.id),
      name: String(item.name ?? item.title ?? 'Senza nome'),
      campaignId: item.campaignId ?? item.campaign_id ?? null,
      adventureId: item.adventureId ?? item.adventure_id ?? null,
      parentLocationId: item.parentLocationId ?? item.parent_location_id ?? null
    }))
    .filter(item => item.campaignId == null || item.campaignId === campaignId)
    .sort((a, b) => a.name.localeCompare(b.name, 'it'));
}

function loadReferencesFromLocalStorage(
  storageKey: string,
  campaignId = DEFAULT_CAMPAIGN_ID
): EntityReference[] {
  if (typeof window === 'undefined') return [];

  try {
    const saved = window.localStorage.getItem(storageKey);
    if (!saved) return [];

    const parsed = JSON.parse(saved);
    if (!Array.isArray(parsed)) return [];

    return normalizeReferences(parsed, campaignId);
  } catch (error) {
    console.error('Errore caricamento riferimenti entità da localStorage:', error);
    return [];
  }
}

async function loadReferencesFromSupabase(
  tableName: string,
  campaignId = DEFAULT_CAMPAIGN_ID,
  nameColumn: 'name' | 'title' = 'name'
): Promise<EntityReference[]> {
  if (!supabase) return [];

  const selectColumns =
    tableName === 'environments'
      ? `id,${nameColumn},campaign_id,adventure_id,parent_location_id`
      : `id,${nameColumn},campaign_id`;

  const { data, error } = await supabase
    .from(tableName)
    .select(selectColumns)
    .or(`campaign_id.is.null,campaign_id.eq.${campaignId}`)
    .order(nameColumn, { ascending: true });

  if (error) {
    console.error(`Errore caricamento riferimenti ${tableName}:`, error);
    return [];
  }

  return normalizeReferences(data ?? [], campaignId);
}

async function loadReferences(
  tableName: string,
  storageKey: string,
  campaignId = DEFAULT_CAMPAIGN_ID,
  nameColumn: 'name' | 'title' = 'name'
): Promise<EntityReference[]> {
  const cloudReferences = await loadReferencesFromSupabase(
    tableName,
    campaignId,
    nameColumn
  );

  if (cloudReferences.length > 0) {
    return cloudReferences;
  }

  return loadReferencesFromLocalStorage(storageKey, campaignId);
}

export async function loadEnvironmentReferences(
  campaignId = DEFAULT_CAMPAIGN_ID
): Promise<EntityReference[]> {
  return loadReferences(
    'environments',
    CAMPAIGN_STORAGE_KEYS.environments,
    campaignId,
    'name'
  );
}

export async function loadNpcReferences(
  campaignId = DEFAULT_CAMPAIGN_ID
): Promise<EntityReference[]> {
  return loadReferences(
    'npcs',
    CAMPAIGN_STORAGE_KEYS.npcs,
    campaignId,
    'name'
  );
}

export async function loadMonsterReferences(
  campaignId = DEFAULT_CAMPAIGN_ID
): Promise<EntityReference[]> {
  return loadReferences(
    'monsters',
    CAMPAIGN_STORAGE_KEYS.monsters,
    campaignId,
    'name'
  );
}

export async function loadEquipmentReferences(
  campaignId = DEFAULT_CAMPAIGN_ID
): Promise<EntityReference[]> {
  return loadReferences(
    'equipment_catalog',
    CAMPAIGN_STORAGE_KEYS.equipmentCatalog,
    campaignId,
    'name'
  );
}

export async function loadEntityReferenceBundle(
  campaignId = DEFAULT_CAMPAIGN_ID
): Promise<EntityReferenceBundle> {
  const [environments, npcs, monsters, equipment] = await Promise.all([
    loadEnvironmentReferences(campaignId),
    loadNpcReferences(campaignId),
    loadMonsterReferences(campaignId),
    loadEquipmentReferences(campaignId)
  ]);

  return {
    environments,
    npcs,
    monsters,
    equipment
  };
}


export async function loadAdventureReferences(
  campaignId?: string
): Promise<EntityReference[]> {
  const resolvedCampaignId = campaignId ?? DEFAULT_CAMPAIGN_ID;

  try {
    const { loadAdventures } = await import('../supabase/entitiesService');
    const adventures = await loadAdventures(resolvedCampaignId);

    return normalizeReferences(adventures, resolvedCampaignId);
  } catch (error) {
    console.error('Errore caricamento riferimenti Avventure:', error);
    return loadReferencesFromLocalStorage(
      CAMPAIGN_STORAGE_KEYS.adventures,
      resolvedCampaignId
    );
  }
}

