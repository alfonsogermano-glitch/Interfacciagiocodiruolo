export type DbUserRole = 'player' | 'gm' | 'admin';
export type DbCampaignRole = 'gm' | 'player';
export type DbCharacterStatus = 'draft' | 'active' | 'archived';

export type DbEquipmentType = 'tascabile' | 'trasportabile' | 'risorsa' | 'arma';
export type DbEquipmentLocation =
  | 'in_tasca'
  | 'nel_zaino'
  | 'indossato'
  | 'a_casa'
  | 'disponibile';

export type DbEquipmentCatalogSource = 'base' | 'gm_custom';
export type DbCharacterEquipmentSource = 'catalog' | 'custom';
export type DbEquipmentRarity = 'common' | 'rare' | 'unique' | 'story';

export interface ProfileRow {
  id: string;
  display_name: string | null;
  role: DbUserRole;
  created_at: string;
  updated_at: string;
}

export interface CampaignRow {
  id: string;
  name: string;
  description: string;
  created_by: string;
  created_at: string;
  updated_at: string;
}

export interface CampaignMemberRow {
  id: string;
  campaign_id: string;
  profile_id: string;
  role: DbCampaignRole;
  created_at: string;
}

export interface CharacterRow {
  id: string;
  campaign_id: string;
  owner_profile_id: string;

  name: string;
  style: string | null;
  journey: string | null;
  status: DbCharacterStatus;

  portrait_url: string | null;
  background_url: string | null;

  sheet_data: Record<string, unknown>;

  created_at: string;
  updated_at: string;
}

export interface EquipmentCatalogRow {
  id: string;

  campaign_id: string | null;
  created_by: string | null;

  name: string;
  description: string;

  type: DbEquipmentType;
  is_vehicle: boolean;

  source: DbEquipmentCatalogSource;
  rarity: DbEquipmentRarity;

  is_clue: boolean;
  is_story_item: boolean;
  is_active: boolean;
  is_public: boolean;

  tags: string[];

  created_at: string;
  updated_at: string;
}

export interface CharacterEquipmentRow {
  id: string;

  character_id: string;
  catalog_item_id: string | null;

  name: string;
  description: string;

  type: DbEquipmentType;
  is_vehicle: boolean;

  location: DbEquipmentLocation;
  inseparabile: boolean;
  quantity: number;

  source: DbCharacterEquipmentSource;
  custom_data: Record<string, unknown>;

  created_at: string;
  updated_at: string;
}