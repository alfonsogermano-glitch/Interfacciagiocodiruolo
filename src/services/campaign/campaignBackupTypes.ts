export interface CampaignBackupData {
  playerCharacters: unknown[];
  npcs: unknown[];
  monsters: unknown[];
  clues: unknown[];
  environments: unknown[];
  situations: unknown[];
  maps: unknown | null;
  combat: unknown | null;
  equipmentCatalog: unknown[];
  characterEquipment: unknown[];
  chapters: unknown[];
  scenes?: unknown[];
  visualAssets?: unknown[];
}

export interface CampaignBackup {
  version: 2;
  app: 'high-school-cthulhu-dashboard';
  exportedAt: string;
  data: CampaignBackupData;
}

export interface LegacyCampaignBackup {
  version: 1;
  app: 'high-school-cthulhu-dashboard';
  exportedAt: string;
  data: Partial<CampaignBackupData> & { adventures?: unknown[] };
}

export type ImportableCampaignBackup = CampaignBackup | LegacyCampaignBackup;
