import type {
  EquipmentLocation,
  EquipmentRarity,
  EquipmentType
} from './equipment';
import type { CharacterSheetData, CharacterStatus } from './character';

export type AddCharacterItemMode = 'catalog' | 'custom';

export interface CreateCharacterInput {
  campaignId: string;
  ownerProfileId: string;

  name: string;
  style?: string | null;
  journey?: string | null;
  status?: CharacterStatus;

  portraitUrl?: string | null;
  backgroundUrl?: string | null;

  sheetData?: CharacterSheetData;
}

export interface UpdateCharacterInput {
  name?: string;
  style?: string | null;
  journey?: string | null;
  status?: CharacterStatus;

  portraitUrl?: string | null;
  backgroundUrl?: string | null;

  sheetData?: CharacterSheetData;
}

export interface CreateCatalogItemInput {
  campaignId?: string | null;
  name: string;
  description: string;
  type: EquipmentType;
  isVehicle?: boolean;

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