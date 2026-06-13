export type EquipmentType = 'tascabile' | 'trasportabile' | 'risorsa' | 'arma';

export type EquipmentLocation =
  | 'in_tasca'
  | 'nel_zaino'
  | 'indossato'
  | 'a_casa'
  | 'disponibile';

export type EquipmentCatalogSource = 'base' | 'gm_custom';

export type CharacterEquipmentSource = 'catalog' | 'custom';

export type EquipmentRarity = 'common' | 'rare' | 'unique' | 'story';

export interface EquipmentCatalogItem {
  id: string;

  campaignId: string | null;
  createdBy: string | null;

  imageAssetId?: string | null;
  iconId?: string | null;
  iconColor?: string | null;

  linkedEnvironmentIds: string[];
  linkedNpcIds: string[];
  linkedMonsterIds: string[];

  containerItemId?: string | null;

  name: string;
  description: string;

  type: EquipmentType;
  isVehicle: boolean;

  source: EquipmentCatalogSource;
  rarity: EquipmentRarity;

  isClue: boolean;
  isStoryItem: boolean;
  isActive: boolean;
  isPublic: boolean;

  tags: string[];

  createdAt: string;
  updatedAt: string;
}

export interface CharacterEquipmentItem {
  id: string;

  characterId: string;
  catalogItemId: string | null;

  name: string;
  description: string;

  type: EquipmentType;
  isVehicle: boolean;

  location: EquipmentLocation;
  inseparabile: boolean;
  quantity: number;

  source: CharacterEquipmentSource;
  customData: Record<string, unknown>;

  createdAt: string;
  updatedAt: string;
}

export interface CreateCatalogItemInput {
  campaignId?: string | null;

  name: string;
  description: string;

  type: EquipmentType;
  isVehicle?: boolean;

  imageAssetId?: string | null;
  iconId?: string | null;
  iconColor?: string | null;

  linkedEnvironmentIds?: string[];
  linkedNpcIds?: string[];
  linkedMonsterIds?: string[];

  containerItemId?: string | null;

  rarity?: EquipmentRarity;
  isClue?: boolean;
  isStoryItem?: boolean;
  isPublic?: boolean;

  tags?: string[];
}

export interface UpdateCatalogItemInput {
  name?: string;
  description?: string;

  type?: EquipmentType;
  isVehicle?: boolean;

  imageAssetId?: string | null;
  iconId?: string | null;
  iconColor?: string | null;

  linkedEnvironmentIds?: string[];
  linkedNpcIds?: string[];
  linkedMonsterIds?: string[];

  containerItemId?: string | null;

  rarity?: EquipmentRarity;
  isClue?: boolean;
  isStoryItem?: boolean;
  isActive?: boolean;
  isPublic?: boolean;

  tags?: string[];
}

export interface AddCharacterEquipmentFromCatalogInput {
  characterId: string;
  catalogItemId: string;

  location: EquipmentLocation;
  inseparabile?: boolean;
  quantity?: number;

  overrideDescription?: string;
}

export interface AddCustomCharacterEquipmentInput {
  characterId: string;

  name: string;
  description: string;
  type: EquipmentType;
  isVehicle?: boolean;

  location: EquipmentLocation;
  inseparabile?: boolean;
  quantity?: number;
}

export interface UpdateCharacterEquipmentInput {
  name?: string;
  description?: string;
  type?: EquipmentType;
  isVehicle?: boolean;

  location?: EquipmentLocation;
  inseparabile?: boolean;
  quantity?: number;

  customData?: Record<string, unknown>;
}