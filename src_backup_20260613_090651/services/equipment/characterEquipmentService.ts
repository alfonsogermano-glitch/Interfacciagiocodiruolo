import type {
  AddCharacterEquipmentFromCatalogInput,
  AddCustomCharacterEquipmentInput,
  CharacterEquipmentItem,
  UpdateCharacterEquipmentInput
} from '../../types/equipment';

import { CAMPAIGN_STORAGE_KEYS } from '../campaign/campaignStorageKeys';
import { getEquipmentCatalogForManagement } from './equipmentCatalogService';
import { generateUUID } from '../../lib/uuid';

const STORAGE_KEY = CAMPAIGN_STORAGE_KEYS.characterEquipment;

type EquipmentStore = Record<string, CharacterEquipmentItem[]>;

function nowIso(): string {
  return new Date().toISOString();
}

function canUseStorage(): boolean {
  return typeof window !== 'undefined' && !!window.localStorage;
}

function readStore(): EquipmentStore {
  if (!canUseStorage()) {
    return {};
  }

  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return {};
    }

    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? (parsed as EquipmentStore) : {};
  } catch {
    return {};
  }
}

function writeStore(store: EquipmentStore): void {
  if (!canUseStorage()) {
    return;
  }

  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
}

function getCharacterItems(characterId: string): CharacterEquipmentItem[] {
  const store = readStore();
  return store[characterId] ?? [];
}

function setCharacterItems(characterId: string, items: CharacterEquipmentItem[]): void {
  const store = readStore();
  store[characterId] = items;
  writeStore(store);
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

  const items = getCharacterItems(input.characterId);
  setCharacterItems(input.characterId, [...items, newItem]);

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

  const items = getCharacterItems(input.characterId);
  setCharacterItems(input.characterId, [...items, newItem]);

  return newItem;
}

export async function updateCharacterEquipment(
  id: string,
  patch: UpdateCharacterEquipmentInput
): Promise<CharacterEquipmentItem> {
  const store = readStore();

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

    store[characterId] = items.map(item => (item.id === id ? updated : item));
    writeStore(store);

    return updated;
  }

  throw new Error('Oggetto del personaggio non trovato.');
}

export async function removeCharacterEquipment(id: string): Promise<void> {
  const store = readStore();

  for (const characterId of Object.keys(store)) {
    const items = store[characterId];
    const exists = items.some(item => item.id === id);

    if (!exists) {
      continue;
    }

    store[characterId] = items.filter(item => item.id !== id);
    writeStore(store);
    return;
  }

  throw new Error('Oggetto del personaggio non trovato.');
}