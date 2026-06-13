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
  adventures: unknown[];
  visualAssets?: unknown[];
}

export interface CampaignBackup {
  version: 1;
  app: 'high-school-cthulhu-dashboard';
  exportedAt: string;
  data: CampaignBackupData;
}