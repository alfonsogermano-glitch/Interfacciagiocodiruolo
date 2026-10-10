import { CAMPAIGN_STORAGE_KEYS } from './campaignStorageKeys';
import { persistenceKey } from '../storage/persistenceMode';
import type { CampaignBackup, CampaignBackupData, ImportableCampaignBackup } from './campaignBackupTypes';
import { LEGACY_CHAPTER_STORAGE_KEYS, normalizeLegacyChapterValue } from './chapterMigration';
import { migrateBackupToSpatialDomain } from './spatialDomainMigration';

const BACKUP_VERSION = 3 as const;
const ACCEPTED_BACKUP_VERSIONS = [1, 2, 3] as const;

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

  // Il backup v3 è già normalizzato sul dominio spaziale: le Environment
  // restano solo come input di compatibilità e la conversione è idempotente
  // (nessuna creazione di capitoli/scene duplicati).
  const converted = migrateBackupToSpatialDomain({
    chapters: data.chapters,
    scenes: data.scenes,
    environments: data.environments
  });

  return {
    version: BACKUP_VERSION,
    app: 'high-school-cthulhu-dashboard',
    exportedAt: new Date().toISOString(),
    data: {
      ...data,
      chapters: converted.chapters,
      scenes: converted.scenes,
      environments: converted.environments
    }
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
    !ACCEPTED_BACKUP_VERSIONS.includes(parsed.version as (typeof ACCEPTED_BACKUP_VERSIONS)[number]) ||
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
    !ACCEPTED_BACKUP_VERSIONS.includes(backup.version as (typeof ACCEPTED_BACKUP_VERSIONS)[number]) ||
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
  writeValue(CAMPAIGN_STORAGE_KEYS.situations, data.situations ?? []);
  writeValue(CAMPAIGN_STORAGE_KEYS.maps, backup.data.maps ?? null);
  writeValue(CAMPAIGN_STORAGE_KEYS.combat, backup.data.combat ?? null);
  writeValue(CAMPAIGN_STORAGE_KEYS.equipmentCatalog, backup.data.equipmentCatalog ?? []);
  writeValue(CAMPAIGN_STORAGE_KEYS.characterEquipment, backup.data.characterEquipment ?? []);
  const legacyChapters = backup.version === 1 ? backup.data.adventures : undefined;
  const sourceChapters = data.chapters ?? normalizeLegacyChapterValue(legacyChapters ?? []);
  writeValue(CAMPAIGN_STORAGE_KEYS.visualAssets, backup.data.visualAssets ?? []);

  // Anche i backup v1/v2 con soli luoghi legacy vengono convertiti sul dominio
  // Capitolo/Scena. Le Environment sopravvivono come input di compatibilità e
  // la conversione non duplica capitoli/scene già presenti nel backup.
  const converted = migrateBackupToSpatialDomain({
    chapters: sourceChapters,
    scenes: data.scenes,
    environments: data.environments
  });

  writeValue(CAMPAIGN_STORAGE_KEYS.environments, converted.environments);
  writeValue(CAMPAIGN_STORAGE_KEYS.chapters, converted.chapters);
  writeValue(CAMPAIGN_STORAGE_KEYS.scenes, converted.scenes);
}
