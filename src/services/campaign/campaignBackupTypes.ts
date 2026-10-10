export interface CampaignBackupData {
  playerCharacters: unknown[];
  npcs: unknown[];
  monsters: unknown[];
  clues: unknown[];
  /** Solo input di compatibilità del cutover spaziale: non è più un dominio attivo. */
  environments: unknown[];
  situations: unknown[];
  maps: unknown | null;
  combat: unknown | null;
  equipmentCatalog: unknown[];
  characterEquipment: unknown[];
  chapters: unknown[];
  scenes: unknown[];
  visualAssets?: unknown[];
}

export interface CampaignBackup {
  version: 3;
  app: 'high-school-cthulhu-dashboard';
  exportedAt: string;
  data: CampaignBackupData;
}

export interface CampaignBackupV2 {
  version: 2;
  app: 'high-school-cthulhu-dashboard';
  exportedAt: string;
  data: Partial<CampaignBackupData> & { adventures?: unknown[] };
}

export interface LegacyCampaignBackup {
  version: 1;
  app: 'high-school-cthulhu-dashboard';
  exportedAt: string;
  data: Partial<CampaignBackupData> & { adventures?: unknown[] };
}

export type ImportableCampaignBackup = CampaignBackup | CampaignBackupV2 | LegacyCampaignBackup;
