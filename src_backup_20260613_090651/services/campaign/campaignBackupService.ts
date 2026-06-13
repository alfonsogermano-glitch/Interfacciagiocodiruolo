import { CAMPAIGN_STORAGE_KEYS } from './campaignStorageKeys';
import type { CampaignBackup, CampaignBackupData } from './campaignBackupTypes';

function safeParseArray(value: string | null): unknown[] {
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

function safeParseAny(value: string | null): unknown | null {
  if (!value) {
    return null;
  }

  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

function ensureWindowAvailable(): void {
  if (typeof window === 'undefined') {
    throw new Error('localStorage non disponibile in questo ambiente.');
  }
}

export function exportCampaignBackup(): CampaignBackup {
  ensureWindowAvailable();

  const data: CampaignBackupData = {
    playerCharacters: safeParseArray(
      window.localStorage.getItem(CAMPAIGN_STORAGE_KEYS.playerCharacters)
    ),
    npcs: safeParseArray(
      window.localStorage.getItem(CAMPAIGN_STORAGE_KEYS.npcs)
    ),
    monsters: safeParseArray(
      window.localStorage.getItem(CAMPAIGN_STORAGE_KEYS.monsters)
    ),
    clues: safeParseArray(
      window.localStorage.getItem(CAMPAIGN_STORAGE_KEYS.clues)
    ),
    environments: safeParseArray(
      window.localStorage.getItem(CAMPAIGN_STORAGE_KEYS.environments)
    ),
    situations: safeParseArray(
      window.localStorage.getItem(CAMPAIGN_STORAGE_KEYS.situations)
    ),
    maps: safeParseAny(
      window.localStorage.getItem(CAMPAIGN_STORAGE_KEYS.maps)
    ),
    combat: safeParseAny(
      window.localStorage.getItem(CAMPAIGN_STORAGE_KEYS.combat)
    ),
    equipmentCatalog: safeParseArray(
      window.localStorage.getItem(CAMPAIGN_STORAGE_KEYS.equipmentCatalog)
    ),
    characterEquipment: safeParseArray(
      window.localStorage.getItem(CAMPAIGN_STORAGE_KEYS.characterEquipment)
    ),
    adventures: safeParseArray(
      window.localStorage.getItem(CAMPAIGN_STORAGE_KEYS.adventures)
    ),
    visualAssets: safeParseArray(
    window.localStorage.getItem(CAMPAIGN_STORAGE_KEYS.visualAssets)
    )
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

  window.localStorage.setItem(
    CAMPAIGN_STORAGE_KEYS.playerCharacters,
    JSON.stringify(backup.data.playerCharacters ?? [])
  );

  window.localStorage.setItem(
    CAMPAIGN_STORAGE_KEYS.npcs,
    JSON.stringify(backup.data.npcs ?? [])
  );

  window.localStorage.setItem(
    CAMPAIGN_STORAGE_KEYS.monsters,
    JSON.stringify(backup.data.monsters ?? [])
  );

  window.localStorage.setItem(
    CAMPAIGN_STORAGE_KEYS.clues,
    JSON.stringify(backup.data.clues ?? [])
  );

  window.localStorage.setItem(
    CAMPAIGN_STORAGE_KEYS.environments,
    JSON.stringify(backup.data.environments ?? [])
  );

  window.localStorage.setItem(
    CAMPAIGN_STORAGE_KEYS.situations,
    JSON.stringify(backup.data.situations ?? [])
  );

  window.localStorage.setItem(
  CAMPAIGN_STORAGE_KEYS.maps,
  JSON.stringify(backup.data.maps ?? null)
  );

  window.localStorage.setItem(
    CAMPAIGN_STORAGE_KEYS.combat,
    JSON.stringify(backup.data.combat ?? null)
  );

  window.localStorage.setItem(
    CAMPAIGN_STORAGE_KEYS.equipmentCatalog,
    JSON.stringify(backup.data.equipmentCatalog ?? [])
  );

  window.localStorage.setItem(
    CAMPAIGN_STORAGE_KEYS.characterEquipment,
    JSON.stringify(backup.data.characterEquipment ?? [])
  );
  window.localStorage.setItem(
    CAMPAIGN_STORAGE_KEYS.adventures,
    JSON.stringify(backup.data.adventures ?? [])
  );
  window.localStorage.setItem(
  CAMPAIGN_STORAGE_KEYS.visualAssets,
  JSON.stringify(backup.data.visualAssets ?? [])
);
}