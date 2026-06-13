import type {
  CreateCatalogItemInput,
  EquipmentCatalogItem,
  UpdateCatalogItemInput
} from '../../types/equipment';
import {
  OGGETTI_TASCABILI,
  OGGETTI_TRASPORTABILI,
  RISORSE,
  RISORSE_VEICOLI
} from '../../data/equipmentData';
import { generateUUID } from '../../lib/uuid';
import { supabase } from '../../lib/supabaseClient';
import { readDashboardSettings } from '../settings/dashboardSettings';
import { isTauriRuntime } from '../runtime/runtimeEnvironment';
import { createIndexedDbAdapter } from '../storage/indexedDbAdapter';
import {
  deleteTauriEntity,
  loadTauriEntities,
  saveTauriEntity
} from '../storage/tauriJsonEntityStorage';

type EquipmentCatalogEntity = EquipmentCatalogItem & {
  campaignId: string | null;
};

const indexedDbEquipmentCatalogStorage =
  createIndexedDbAdapter<EquipmentCatalogEntity>('equipmentCatalog');

function nowIso(): string {
  return new Date().toISOString();
}

function shouldUseLocalMode(): boolean {
  const settings = readDashboardSettings();
  return settings.saveMode === 'local' || !supabase;
}

function createStandardCatalogItem(
  name: string,
  type: EquipmentCatalogItem['type'],
  isVehicle = false
): EquipmentCatalogItem {
  const now = 'standard';

  return {
    id: `standard-${type}-${name
      .toLowerCase()
      .replaceAll(' ', '-')
      .replaceAll('(', '')
      .replaceAll(')', '')}`,
    campaignId: null,
    createdBy: null,
    imageAssetId: null,
    iconId: null,
    iconColor: null,
    linkedEnvironmentIds: [],
    linkedNpcIds: [],
    linkedMonsterIds: [],
    containerItemId: null,
    name,
    description: '',
    type,
    isVehicle,
    source: 'base',
    rarity: 'common',
    isClue: false,
    isStoryItem: false,
    isActive: true,
    isPublic: true,
    tags: [],
    createdAt: now,
    updatedAt: now
  };
}

function getStandardCatalog(): EquipmentCatalogItem[] {
  return [
    ...OGGETTI_TASCABILI.map(name =>
      createStandardCatalogItem(name, 'tascabile')
    ),
    ...OGGETTI_TRASPORTABILI.map(name =>
      createStandardCatalogItem(name, 'trasportabile')
    ),
    ...RISORSE.map(name =>
      createStandardCatalogItem(
        name,
        'risorsa',
        RISORSE_VEICOLI.includes(name)
      )
    )
  ];
}

function normalizeStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === 'string');
}

function normalizeCatalogItem(
  item: Partial<EquipmentCatalogItem>
): EquipmentCatalogItem {
  const now = nowIso();

  return {
    id: item.id ?? generateUUID(),
    campaignId: item.campaignId ?? null,
    createdBy: item.createdBy ?? null,
    imageAssetId: item.imageAssetId ?? null,
    iconId: item.iconId ?? null,
    iconColor: item.iconColor ?? null,
    linkedEnvironmentIds: normalizeStringArray(item.linkedEnvironmentIds),
    linkedNpcIds: normalizeStringArray(item.linkedNpcIds),
    linkedMonsterIds: normalizeStringArray(item.linkedMonsterIds),
    containerItemId: item.containerItemId ?? null,
    name: item.name ?? 'Oggetto senza nome',
    description: item.description ?? '',
    type: item.type ?? 'risorsa',
    isVehicle: item.isVehicle ?? false,
    source: item.source ?? 'gm_custom',
    rarity: item.rarity ?? 'common',
    isClue: item.isClue ?? false,
    isStoryItem: item.isStoryItem ?? false,
    isActive: item.isActive ?? true,
    isPublic: item.isPublic ?? true,
    tags: normalizeStringArray(item.tags),
    createdAt: item.createdAt ?? now,
    updatedAt: item.updatedAt ?? item.createdAt ?? now
  };
}

function sortByName(items: EquipmentCatalogItem[]): EquipmentCatalogItem[] {
  return [...items].sort((a, b) => a.name.localeCompare(b.name, 'it'));
}

function sortByUpdatedAtDesc(
  items: EquipmentCatalogItem[]
): EquipmentCatalogItem[] {
  return [...items].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

function sameScope(item: EquipmentCatalogItem, campaignId?: string): boolean {
  if (!campaignId) return item.campaignId === null;
  return item.campaignId === null || item.campaignId === campaignId;
}

function toSupabaseRow(item: EquipmentCatalogItem) {
  return {
    id: item.id,
    campaign_id: item.campaignId,
    created_by: item.createdBy,
    image_asset_id: item.imageAssetId,
    icon_id: item.iconId,
    icon_color: item.iconColor,
    linked_environment_ids: item.linkedEnvironmentIds ?? [],
    linked_npc_ids: item.linkedNpcIds ?? [],
    linked_monster_ids: item.linkedMonsterIds ?? [],
    container_item_id: item.containerItemId,
    name: item.name,
    description: item.description,
    type: item.type,
    is_vehicle: item.isVehicle,
    source: item.source,
    rarity: item.rarity,
    is_clue: item.isClue,
    is_story_item: item.isStoryItem,
    is_active: item.isActive,
    is_public: item.isPublic,
    tags: item.tags ?? [],
    created_at: item.createdAt,
    updated_at: item.updatedAt
  };
}

function fromSupabaseRow(row: any): EquipmentCatalogItem {
  return normalizeCatalogItem({
    id: row.id,
    campaignId: row.campaign_id,
    createdBy: row.created_by,
    imageAssetId: row.image_asset_id,
    iconId: row.icon_id,
    iconColor: row.icon_color,
    linkedEnvironmentIds: row.linked_environment_ids ?? [],
    linkedNpcIds: row.linked_npc_ids ?? [],
    linkedMonsterIds: row.linked_monster_ids ?? [],
    containerItemId: row.container_item_id,
    name: row.name,
    description: row.description,
    type: row.type,
    isVehicle: row.is_vehicle,
    source: row.source,
    rarity: row.rarity,
    isClue: row.is_clue,
    isStoryItem: row.is_story_item,
    isActive: row.is_active,
    isPublic: row.is_public,
    tags: row.tags,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  });
}

async function loadLocalCatalog(
  campaignId?: string
): Promise<EquipmentCatalogItem[]> {
  if (isTauriRuntime()) {
    const campaignItems = campaignId
      ? await loadTauriEntities<EquipmentCatalogEntity>(campaignId, 'equipmentCatalog')
      : [];

    const globalItems = await loadTauriEntities<EquipmentCatalogEntity>(
      'global',
      'equipmentCatalog'
    );

    return [...globalItems, ...campaignItems].map(normalizeCatalogItem);
  }

  const items = await indexedDbEquipmentCatalogStorage.getAll();
  return items.map(normalizeCatalogItem);
}

async function saveLocalCatalogItem(
  item: EquipmentCatalogItem
): Promise<EquipmentCatalogItem> {
  const normalized = normalizeCatalogItem(item) as EquipmentCatalogEntity;

  if (isTauriRuntime()) {
    await saveTauriEntity<EquipmentCatalogEntity>(
      normalized.campaignId ?? 'global',
      'equipmentCatalog',
      normalized
    );
    return normalized;
  }

  await indexedDbEquipmentCatalogStorage.upsert(normalized);
  return normalized;
}

async function deleteLocalCatalogItem(
  id: string,
  campaignId?: string | null
): Promise<void> {
  if (isTauriRuntime()) {
    await deleteTauriEntity(campaignId ?? 'global', 'equipmentCatalog', id);
    return;
  }

  await indexedDbEquipmentCatalogStorage.remove(id);
}

async function loadCloudCatalog(
  campaignId?: string
): Promise<EquipmentCatalogItem[]> {
  if (!supabase) return loadLocalCatalog(campaignId);

  let query = supabase
    .from('equipment_catalog')
    .select(
      [
        'id',
        'campaign_id',
        'created_by',
        'image_asset_id',
        'icon_id',
        'icon_color',
        'linked_environment_ids',
        'linked_npc_ids',
        'linked_monster_ids',
        'container_item_id',
        'name',
        'description',
        'type',
        'is_vehicle',
        'source',
        'rarity',
        'is_clue',
        'is_story_item',
        'is_active',
        'is_public',
        'tags',
        'created_at',
        'updated_at'
      ].join(',')
    );

  if (campaignId) {
    query = query.or(`campaign_id.is.null,campaign_id.eq.${campaignId}`);
  } else {
    query = query.is('campaign_id', null);
  }

  const { data, error } = await query;

  if (error) {
    console.error('Errore caricamento catalogo equipaggiamento da Supabase:', error);
    return loadLocalCatalog(campaignId);
  }

  return (data ?? []).map(fromSupabaseRow);
}

async function saveCloudCatalogItem(
  item: EquipmentCatalogItem
): Promise<EquipmentCatalogItem> {
  const normalized = normalizeCatalogItem(item);

  if (!supabase) return saveLocalCatalogItem(normalized);

  const { error } = await supabase
    .from('equipment_catalog')
    .upsert(toSupabaseRow(normalized), { onConflict: 'id' });

  if (error) {
    console.error('Errore salvataggio catalogo equipaggiamento su Supabase:', error);
    throw new Error(error.message);
  }

  return normalized;
}

async function deleteCloudCatalogItem(id: string): Promise<void> {
  if (!supabase) {
    await deleteLocalCatalogItem(id);
    return;
  }

  const { error } = await supabase
    .from('equipment_catalog')
    .delete()
    .eq('id', id);

  if (error) {
    console.error('Errore eliminazione catalogo equipaggiamento da Supabase:', error);
    throw new Error(error.message);
  }
}

async function loadCustomCatalog(
  campaignId?: string
): Promise<EquipmentCatalogItem[]> {
  const items = shouldUseLocalMode()
    ? await loadLocalCatalog(campaignId)
    : await loadCloudCatalog(campaignId);

  return items.map(normalizeCatalogItem);
}

async function saveCatalogItem(
  item: EquipmentCatalogItem
): Promise<EquipmentCatalogItem> {
  if (shouldUseLocalMode()) return saveLocalCatalogItem(item);
  return saveCloudCatalogItem(item);
}

export async function getEquipmentCatalog(
  campaignId?: string
): Promise<EquipmentCatalogItem[]> {
  const customItems = await loadCustomCatalog(campaignId);
  const items = [...getStandardCatalog(), ...customItems]
    .filter(item => item.isActive)
    .filter(item => sameScope(item, campaignId));

  return sortByName(items);
}

export async function getEquipmentCatalogForManagement(
  campaignId?: string
): Promise<EquipmentCatalogItem[]> {
  const customItems = await loadCustomCatalog(campaignId);
  const items = [...getStandardCatalog(), ...customItems]
    .filter(item => sameScope(item, campaignId));

  return sortByUpdatedAtDesc(items);
}

export async function createCatalogItem(
  input: CreateCatalogItemInput
): Promise<EquipmentCatalogItem> {
  const now = nowIso();

  const item = normalizeCatalogItem({
    id: generateUUID(),
    campaignId: input.campaignId ?? null,
    createdBy: null,
    imageAssetId: input.imageAssetId ?? null,
    iconId: input.iconId ?? null,
    iconColor: input.iconColor ?? null,
    linkedEnvironmentIds: input.linkedEnvironmentIds ?? [],
    linkedNpcIds: input.linkedNpcIds ?? [],
    linkedMonsterIds: input.linkedMonsterIds ?? [],
    containerItemId: input.containerItemId ?? null,
    name: input.name.trim(),
    description: input.description.trim(),
    type: input.type,
    isVehicle: input.isVehicle ?? false,
    source: 'gm_custom',
    rarity: input.rarity ?? 'common',
    isClue: input.isClue ?? false,
    isStoryItem: input.isStoryItem ?? false,
    isActive: true,
    isPublic: input.isPublic ?? true,
    tags: input.tags ?? [],
    createdAt: now,
    updatedAt: now
  });

  return saveCatalogItem(item);
}

export async function updateCatalogItem(
  id: string,
  patch: UpdateCatalogItemInput,
  campaignId?: string
): Promise<EquipmentCatalogItem> {
  const existingItems = await loadCustomCatalog(campaignId);
  const existing = existingItems.find(item => item.id === id);

  if (!existing || existing.source === 'base') {
    throw new Error('Oggetto catalogo non trovato.');
  }

  const updated = normalizeCatalogItem({
    ...existing,
    name: patch.name !== undefined ? patch.name.trim() : existing.name,
    description: patch.description !== undefined ? patch.description.trim() : existing.description,
    type: patch.type ?? existing.type,
    isVehicle: patch.isVehicle ?? existing.isVehicle,
    rarity: patch.rarity ?? existing.rarity,
    isClue: patch.isClue ?? existing.isClue,
    isStoryItem: patch.isStoryItem ?? existing.isStoryItem,
    isActive: patch.isActive ?? existing.isActive,
    isPublic: patch.isPublic ?? existing.isPublic,
    tags: patch.tags ?? existing.tags,
    imageAssetId: patch.imageAssetId !== undefined ? patch.imageAssetId : existing.imageAssetId,
    iconId: patch.iconId !== undefined ? patch.iconId : existing.iconId,
    iconColor: patch.iconColor !== undefined ? patch.iconColor : existing.iconColor,
    linkedEnvironmentIds: patch.linkedEnvironmentIds ?? existing.linkedEnvironmentIds ?? [],
    linkedNpcIds: patch.linkedNpcIds ?? existing.linkedNpcIds ?? [],
    linkedMonsterIds: patch.linkedMonsterIds ?? existing.linkedMonsterIds ?? [],
    containerItemId: patch.containerItemId !== undefined ? patch.containerItemId : existing.containerItemId ?? null,
    updatedAt: nowIso()
  });

  return saveCatalogItem(updated);
}

export async function archiveCatalogItem(
  id: string,
  campaignId?: string
): Promise<void> {
  await updateCatalogItem(id, { isActive: false }, campaignId);
}

export async function restoreCatalogItem(
  id: string,
  campaignId?: string
): Promise<void> {
  await updateCatalogItem(id, { isActive: true }, campaignId);
}

export async function deleteCatalogItem(
  id: string,
  campaignId?: string
): Promise<void> {
  const existingItems = await loadCustomCatalog(campaignId);
  const existing = existingItems.find(item => item.id === id);

  if (!existing || existing.source === 'base') return;

  if (shouldUseLocalMode()) {
    await deleteLocalCatalogItem(id, existing.campaignId ?? campaignId);
    return;
  }

  await deleteCloudCatalogItem(id);
}

