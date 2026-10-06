import type {
  AddCharacterEquipmentFromCatalogInput,
  AddCustomCharacterEquipmentInput,
  CharacterEquipmentItem,
  UpdateCharacterEquipmentInput
} from '../../types/equipment';

import { getEquipmentCatalogForManagement } from './equipmentCatalogService';
import { generateUUID } from '../../lib/uuid';
import { mapCharacterEquipmentRow } from '../../lib/mappers/equipmentMappers';
import { supabase } from '../../lib/supabaseClient';

type EquipmentStore = Record<string, CharacterEquipmentItem[]>;

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function nowIso(): string {
  return new Date().toISOString();
}

function isUuid(value: unknown): value is string {
  return typeof value === 'string' && UUID_PATTERN.test(value);
}

function positiveQuantity(value: unknown): number {
  const quantity = Number(value);
  return Number.isFinite(quantity) && quantity > 0 ? quantity : 1;
}

function rowToItem(row: any): CharacterEquipmentItem | null {
  if (!row || typeof row.character_id !== 'string') return null;

  if (typeof row.name === 'string') {
    const mapped = mapCharacterEquipmentRow(row);
    return {
      ...mapped,
      description: mapped.description ?? '',
      quantity: positiveQuantity(mapped.quantity),
      customData: mapped.customData ?? {}
    };
  }

  const payload = row.payload;
  if (payload && typeof payload === 'object' && typeof payload.id === 'string') {
    return {
      ...payload,
      characterId: row.character_id,
      description: typeof payload.description === 'string' ? payload.description : '',
      quantity: positiveQuantity(payload.quantity),
      customData:
        payload.customData && typeof payload.customData === 'object'
          ? payload.customData
          : {}
    } as CharacterEquipmentItem;
  }

  return null;
}

async function readStore(): Promise<EquipmentStore> {
  if (!supabase) throw new Error('Archivio non disponibile');
  const { data, error } = await supabase.from('character_equipment').select('*');
  if (error) throw new Error(error.message);
  const store: EquipmentStore = {};
  for (const row of data ?? []) {
    const item = rowToItem(row);
    if (item) (store[item.characterId] ??= []).push(item);
  }
  return store;
}

async function writeStore(store: EquipmentStore): Promise<void> {
  if (!supabase) throw new Error('Archivio non disponibile');
  const rows = Object.entries(store).flatMap(([characterId, items]) =>
    items.map((item) => ({
      id: item.id,
      character_id: characterId,
      catalog_item_id: isUuid(item.catalogItemId) ? item.catalogItemId : null,
      name: item.name,
      description: item.description ?? '',
      type: item.type,
      is_vehicle: Boolean(item.isVehicle),
      location: item.location,
      inseparabile: Boolean(item.inseparabile),
      quantity: positiveQuantity(item.quantity),
      source: item.source,
      custom_data: item.customData ?? {},
      created_at: item.createdAt,
      updated_at: item.updatedAt
    }))
  );
  if (!rows.length) return;
  const { error } = await supabase
    .from('character_equipment')
    .upsert(rows, { onConflict: 'id' });
  if (error) throw new Error(error.message);
}

async function getCharacterItems(characterId: string): Promise<CharacterEquipmentItem[]> {
  const store = await readStore();
  return store[characterId] ?? [];
}

async function setCharacterItems(characterId: string, items: CharacterEquipmentItem[]): Promise<void> {
  await writeStore({ [characterId]: items });
}

export async function getCharacterEquipment(
  characterId: string
): Promise<CharacterEquipmentItem[]> {
  return getCharacterItems(characterId);
}

export async function addCharacterEquipmentFromCatalog(
  input: AddCharacterEquipmentFromCatalogInput
): Promise<CharacterEquipmentItem> {
  const catalogItems = await getEquipmentCatalogForManagement();
  const catalogItem = catalogItems.find(item => item.id === input.catalogItemId);

  if (!catalogItem) {
    throw new Error('Oggetto di catalogo non trovato.');
  }

  const newItem: CharacterEquipmentItem = {
    id: generateUUID(),
    characterId: input.characterId,
    catalogItemId: catalogItem.id,
    name: catalogItem.name,
    description: input.overrideDescription?.trim() || catalogItem.description,
    type: catalogItem.type,
    isVehicle: catalogItem.isVehicle,
    location: input.location,
    inseparabile: input.inseparabile ?? false,
    quantity: input.quantity ?? 1,
    source: 'catalog',
    customData: {},
    createdAt: nowIso(),
    updatedAt: nowIso()
  };

  await setCharacterItems(input.characterId, [newItem]);

  return newItem;
}

export async function addCustomCharacterEquipment(
  input: AddCustomCharacterEquipmentInput
): Promise<CharacterEquipmentItem> {
  const newItem: CharacterEquipmentItem = {
    id: generateUUID(),
    characterId: input.characterId,
    catalogItemId: null,
    name: input.name.trim(),
    description: input.description.trim(),
    type: input.type,
    isVehicle: input.isVehicle ?? false,
    location: input.location,
    inseparabile: input.inseparabile ?? false,
    quantity: input.quantity ?? 1,
    source: 'custom',
    customData: {},
    createdAt: nowIso(),
    updatedAt: nowIso()
  };

  await setCharacterItems(input.characterId, [newItem]);

  return newItem;
}

export async function updateCharacterEquipment(
  id: string,
  patch: UpdateCharacterEquipmentInput
): Promise<CharacterEquipmentItem> {
  const store = await readStore();

  for (const characterId of Object.keys(store)) {
    const items = store[characterId];
    const existing = items.find(item => item.id === id);

    if (!existing) {
      continue;
    }

    const updated: CharacterEquipmentItem = {
      ...existing,
      name: patch.name !== undefined ? patch.name.trim() : existing.name,
      description:
        patch.description !== undefined
          ? patch.description.trim()
          : existing.description,
      type: patch.type ?? existing.type,
      isVehicle: patch.isVehicle ?? existing.isVehicle,
      location: patch.location ?? existing.location,
      inseparabile: patch.inseparabile ?? existing.inseparabile,
      quantity: patch.quantity ?? existing.quantity,
      customData: patch.customData ?? existing.customData,
      updatedAt: nowIso()
    };

    await setCharacterItems(characterId, [updated]);

    return updated;
  }

  throw new Error('Oggetto del personaggio non trovato.');
}

export async function removeCharacterEquipment(id: string): Promise<void> {
  const store = await readStore();

  for (const characterId of Object.keys(store)) {
    const items = store[characterId];
    const exists = items.some(item => item.id === id);

    if (!exists) {
      continue;
    }

    if (!supabase) throw new Error('Archivio non disponibile');
    const { error } = await supabase.from('character_equipment').delete().eq('id', id);
    if (error) throw new Error(error.message);
    return;
  }

  throw new Error('Oggetto del personaggio non trovato.');
}
