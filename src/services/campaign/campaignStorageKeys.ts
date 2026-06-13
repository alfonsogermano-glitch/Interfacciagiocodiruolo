export const CAMPAIGN_STORAGE_KEYS = {
  playerCharacters: 'gdr-dashboard-player-characters',
  npcs: 'gdr-dashboard-npcs',
  monsters: 'gdr-dashboard-monsters',
  clues: 'gdr-dashboard-clues',
  environments: 'gdr-dashboard-environments',
  situations: 'gdr-dashboard-situations',
  maps: 'gdr-dashboard-maps',
  combat: 'gdr-dashboard-combat',
  equipmentCatalog: 'gdr-dashboard-equipment-catalog',
  characterEquipment: 'gdr-dashboard-character-equipment',
  adventures: 'gdr-dashboard-adventures',
  activeCampaign: 'gdr-dashboard-active-campaign',
  activeAdventure: 'gdr-dashboard-active-adventure',
  visualAssets: 'hsc-visual-assets'
} as const;

export type CampaignStorageKey =
  typeof CAMPAIGN_STORAGE_KEYS[keyof typeof CAMPAIGN_STORAGE_KEYS];