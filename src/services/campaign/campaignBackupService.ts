import { CAMPAIGN_STORAGE_KEYS } from './campaignStorageKeys';
import { persistenceKey } from '../storage/persistenceMode';
import type { CampaignBackup, CampaignBackupData, ImportableCampaignBackup } from './campaignBackupTypes';
import { LEGACY_CHAPTER_STORAGE_KEYS, normalizeLegacyChapterValue } from './chapterMigration';

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

function safeParseArrayWithFallback(key: string, legacyKey: string): unknown[] {
  if (window.localStorage.getItem(persistenceKey(key)) !== null) return safeParseArray(key);
  return normalizeLegacyChapterValue(safeParseArray(legacyKey));
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
    chapters: safeParseArrayWithFallback(CAMPAIGN_STORAGE_KEYS.chapters, LEGACY_CHAPTER_STORAGE_KEYS.chapters),
    scenes: safeParseArray(CAMPAIGN_STORAGE_KEYS.scenes),
    visualAssets: safeParseArray(CAMPAIGN_STORAGE_KEYS.visualAssets)
  };

  return {
    version: 2,
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

export async function readCampaignBackupFromFile(file: File): Promise<ImportableCampaignBackup> {
  const text = await file.text();
  const parsed = JSON.parse(text) as ImportableCampaignBackup;

  if (
    !parsed ||
    (parsed.version !== 1 && parsed.version !== 2) ||
    parsed.app !== 'high-school-cthulhu-dashboard' ||
    !parsed.data
  ) {
    throw new Error('File campagna non valido.');
  }

  return parsed;
}

export function importCampaignBackup(backup: ImportableCampaignBackup): void {
  ensureWindowAvailable();

  if (
    !backup ||
    (backup.version !== 1 && backup.version !== 2) ||
    backup.app !== 'high-school-cthulhu-dashboard' ||
    !backup.data
  ) {
    throw new Error('Struttura backup non valida.');
  }

  const data = normalizeLegacyChapterValue(backup.data);
  writeValue(CAMPAIGN_STORAGE_KEYS.playerCharacters, data.playerCharacters ?? []);
  writeValue(CAMPAIGN_STORAGE_KEYS.npcs, data.npcs ?? []);
  writeValue(CAMPAIGN_STORAGE_KEYS.monsters, data.monsters ?? []);
  writeValue(CAMPAIGN_STORAGE_KEYS.clues, data.clues ?? []);
  writeValue(CAMPAIGN_STORAGE_KEYS.environments, data.environments ?? []);
  writeValue(CAMPAIGN_STORAGE_KEYS.situations, data.situations ?? []);
  writeValue(CAMPAIGN_STORAGE_KEYS.maps, backup.data.maps ?? null);
  writeValue(CAMPAIGN_STORAGE_KEYS.combat, backup.data.combat ?? null);
  writeValue(CAMPAIGN_STORAGE_KEYS.equipmentCatalog, backup.data.equipmentCatalog ?? []);
  writeValue(CAMPAIGN_STORAGE_KEYS.characterEquipment, backup.data.characterEquipment ?? []);
  const legacyChapters = backup.version === 1 ? backup.data.adventures : undefined;
  writeValue(CAMPAIGN_STORAGE_KEYS.chapters, data.chapters ?? normalizeLegacyChapterValue(legacyChapters ?? []));
  writeValue(CAMPAIGN_STORAGE_KEYS.scenes, data.scenes ?? []);
  writeValue(CAMPAIGN_STORAGE_KEYS.visualAssets, backup.data.visualAssets ?? []);
}
