import type {
  CharacterEquipmentRow,
  EquipmentCatalogRow
} from '../../types/database';
import type {
  CharacterEquipmentItem,
  EquipmentCatalogItem
} from '../../types/equipment';

export function mapEquipmentCatalogRow(
  row: EquipmentCatalogRow
): EquipmentCatalogItem {
  return {
    id: row.id,
    campaignId: row.campaign_id,
    createdBy: row.created_by,

    name: row.name,
    description: row.description,

    type: row.type,
    isVehicle: row.is_vehicle,

    source: row.source,
    rarity: row.rarity,

    isClue: row.is_clue,
    isStoryItem: row.is_story_item,
    isActive: row.is_active,
    isPublic: row.is_public,

    tags: row.tags,

    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

export function mapCharacterEquipmentRow(
  row: CharacterEquipmentRow
): CharacterEquipmentItem {
  return {
    id: row.id,

    characterId: row.character_id,
    catalogItemId: row.catalog_item_id,

    name: row.name,
    description: row.description,

    type: row.type,
    isVehicle: row.is_vehicle,

    location: row.location,
    inseparabile: row.inseparabile,
    quantity: row.quantity,

    source: row.source,
    customData: row.custom_data,

    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}