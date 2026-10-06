import { CAMPAIGN_STORAGE_KEYS } from './campaignStorageKeys';
import { persistenceKey } from '../storage/persistenceMode';
import type { CampaignBackup, CampaignBackupData } from './campaignBackupTypes';

function safeParseArray(key: string): unknown[] {
  const value = window.localStorage.getItem(persistenceKey(key));
  if (!value) {
    return [];
  }

  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function safeParseAny(key: string): unknown | null {
  const value = window.localStorage.getItem(persistenceKey(key));
  if (!value) {
    return null;
  }

  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

function writeValue(key: string, value: unknown): void {
  window.localStorage.setItem(persistenceKey(key), JSON.stringify(value));
}

function ensureWindowAvailable(): void {
  if (typeof window === 'undefined') {
    throw new Error('localStorage non disponibile in questo ambiente.');
  }
}

export function exportCampaignBackup(): CampaignBackup {
  ensureWindowAvailable();

  const data: CampaignBackupData = {
    playerCharacters: safeParseArray(CAMPAIGN_STORAGE_KEYS.playerCharacters),
    npcs: safeParseArray(CAMPAIGN_STORAGE_KEYS.npcs),
    monsters: safeParseArray(CAMPAIGN_STORAGE_KEYS.monsters),
    clues: safeParseArray(CAMPAIGN_STORAGE_KEYS.clues),
    environments: safeParseArray(CAMPAIGN_STORAGE_KEYS.environments),
    situations: safeParseArray(CAMPAIGN_STORAGE_KEYS.situations),
    maps: safeParseAny(CAMPAIGN_STORAGE_KEYS.maps),
    combat: safeParseAny(CAMPAIGN_STORAGE_KEYS.combat),
    equipmentCatalog: safeParseArray(CAMPAIGN_STORAGE_KEYS.equipmentCatalog),
    characterEquipment: safeParseArray(CAMPAIGN_STORAGE_KEYS.characterEquipment),
    adventures: safeParseArray(CAMPAIGN_STORAGE_KEYS.adventures),
    visualAssets: safeParseArray(CAMPAIGN_STORAGE_KEYS.visualAssets)
  };

  return {
    version: 1,
    app: 'high-school-cthulhu-dashboard',
    exportedAt: new Date().toISOString(),
    data
  };
}

export function downloadCampaignBackup(filename = 'high-school-cthulhu-campagna.json'): void {
  ensureWindowAvailable();

  const backup = exportCampaignBackup();
  const blob = new Blob([JSON.stringify(backup, null, 2)], {
    type: 'application/json'
  });

  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  URL.revokeObjectURL(url);
}

export async function readCampaignBackupFromFile(file: File): Promise<CampaignBackup> {
  const text = await file.text();
  const parsed = JSON.parse(text) as CampaignBackup;

  if (
    !parsed ||
    parsed.version !== 1 ||
    parsed.app !== 'high-school-cthulhu-dashboard' ||
    !parsed.data
  ) {
    throw new Error('File campagna non valido.');
  }

  return parsed;
}

export function importCampaignBackup(backup: CampaignBackup): void {
  ensureWindowAvailable();

  if (
    !backup ||
    backup.version !== 1 ||
    backup.app !== 'high-school-cthulhu-dashboard' ||
    !backup.data
  ) {
    throw new Error('Struttura backup non valida.');
  }

  writeValue(CAMPAIGN_STORAGE_KEYS.playerCharacters, backup.data.playerCharacters ?? []);
  writeValue(CAMPAIGN_STORAGE_KEYS.npcs, backup.data.npcs ?? []);
  writeValue(CAMPAIGN_STORAGE_KEYS.monsters, backup.data.monsters ?? []);
  writeValue(CAMPAIGN_STORAGE_KEYS.clues, backup.data.clues ?? []);
  writeValue(CAMPAIGN_STORAGE_KEYS.environments, backup.data.environments ?? []);
  writeValue(CAMPAIGN_STORAGE_KEYS.situations, backup.data.situations ?? []);
  writeValue(CAMPAIGN_STORAGE_KEYS.maps, backup.data.maps ?? null);
  writeValue(CAMPAIGN_STORAGE_KEYS.combat, backup.data.combat ?? null);
  writeValue(CAMPAIGN_STORAGE_KEYS.equipmentCatalog, backup.data.equipmentCatalog ?? []);
  writeValue(CAMPAIGN_STORAGE_KEYS.characterEquipment, backup.data.characterEquipment ?? []);
  writeValue(CAMPAIGN_STORAGE_KEYS.adventures, backup.data.adventures ?? []);
  writeValue(CAMPAIGN_STORAGE_KEYS.visualAssets, backup.data.visualAssets ?? []);
}
