import type { CharacterRow } from '../../types/database';
import type {
  CharacterRecord,
  CharacterSheetData,
  CharacterSummary,
  Stile,
  Viaggio
} from '../../types/character';

export function mapCharacterRow(row: CharacterRow): CharacterRecord {
  return {
    id: row.id,
    campaignId: row.campaign_id,
    ownerProfileId: row.owner_profile_id,

    name: row.name,
    style: row.style as Stile | null,
    viaggio: row.journey as Viaggio | null,
    status: row.status,

    portraitUrl: row.portrait_url,
    backgroundUrl: row.background_url,

    sheetData: row.sheet_data as CharacterSheetData,

    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

export function mapCharacterSummary(row: CharacterRow): CharacterSummary {
  return {
    id: row.id,
    campaignId: row.campaign_id,
    ownerProfileId: row.owner_profile_id,

    name: row.name,
    style: row.style as Stile | null,
    viaggio: row.journey as Viaggio | null,
    status: row.status,

    portraitUrl: row.portrait_url,
    backgroundUrl: row.background_url,

    updatedAt: row.updated_at
  };
}