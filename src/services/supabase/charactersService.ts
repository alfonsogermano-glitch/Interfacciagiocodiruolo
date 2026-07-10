import { supabase } from '../../lib/supabaseClient';
import type { Character } from '../../types/character';
import type { RulesetId } from '../../app/campaigns/campaignTypes';
import { readDashboardSettings } from '../settings/dashboardSettings';
import { isTauriRuntime } from '../runtime/runtimeEnvironment';
import {
  deleteTauriEntity,
  loadTauriEntities,
  saveTauriEntity
} from '../storage/tauriJsonEntityStorage';
import { createIndexedDbAdapter } from '../storage/indexedDbAdapter';

type StoredCharacter = Character & {
  id: string;
  campaignId?: string | null;
  ruleset?: RulesetId | null;
  player: string;
  notes: string;
};

const indexedDbCharactersStorage = createIndexedDbAdapter<StoredCharacter>(
  'characters'
);

function shouldUseLocalMode(): boolean {
  const settings = readDashboardSettings();
  return settings.saveMode === 'local' || !supabase;
}

async function loadLocalCharacters(campaignId: string): Promise<StoredCharacter[]> {
  if (isTauriRuntime()) {
    return loadTauriEntities<StoredCharacter>(campaignId, 'characters');
  }

  const characters = await indexedDbCharactersStorage.getAll();
  return characters.filter(character => character.campaignId === campaignId);
}

async function saveLocalCharacter(
  campaignId: string | null,
  character: StoredCharacter
): Promise<void> {
  const payload = {
    ...character,
    campaignId
  };

  if (isTauriRuntime()) {
    await saveTauriEntity<StoredCharacter>(campaignId ?? 'unassigned', 'characters', payload);
    return;
  }

  await indexedDbCharactersStorage.upsert(payload);
}

async function deleteLocalCharacter(characterId: string): Promise<void> {
  if (isTauriRuntime()) {
    await deleteTauriEntity('characters', characterId);
    return;
  }

  await indexedDbCharactersStorage.remove(characterId);
}

function mapRowToCharacter(row: any) {
  return {
    id: row.id,
    name: row.name,
    ownerProfileId: row.owner_profile_id,
    ownerDisplayName: row.owner_display_name ?? null,
    ownerAvatarUrl: row.owner_avatar_url ?? null,
    campaignId: row.campaign_id,
    ruleset: row.ruleset ?? null,
    tokenColor: row.token_color ?? null,
    tokenBackgroundColor: row.token_background_color ?? null,
    tokenBorderStyle: row.token_border_style ?? null,
    tokenBorderThickness: row.token_border_thickness ?? null,
    tokenBorderLabel: row.token_border_label ?? null,
    tokenBorderVisible: row.token_border_visible ?? null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    player: row.sheet_data?.player || '',
    notes: row.sheet_data?.notes || '',
    description: row.sheet_data?.description || '',
    style: row.style || 'Jock',
    viaggio: row.viaggio || 'Campione',
    ambiti: row.sheet_data?.ambiti || { Fisico: 1, Scuola: 1, Carisma: 1, Strada: 1 },
    abilita: row.sheet_data?.abilita || {},
    freschezza: row.sheet_data?.freschezza ?? 12,
    maxFreschezza: row.sheet_data?.maxFreschezza ?? 12,
    caselleFrischezzaCruciali: row.sheet_data?.caselleFrischezzaCruciali || [8, 12],
    follia: row.sheet_data?.follia ?? 9,
    maxFollia: row.sheet_data?.maxFollia ?? 9,
    conditions: row.sheet_data?.conditions || [],
    turbe: row.sheet_data?.turbe || [],
    audacia: row.sheet_data?.audacia ?? 1,
    prodigi: row.sheet_data?.prodigi ?? 0,
    legame: row.sheet_data?.legame || '',
    linkedCharacterId: row.sheet_data?.linkedCharacterId,
    legameDescription: row.sheet_data?.legameDescription,
    coverImageUrl: row.sheet_data?.coverImageUrl,
    portraitImageUrl: row.portrait_image_url ?? undefined,
    portraitCroppedImageUrl: row.portrait_cropped_image_url ?? undefined,
    coverPositionX: row.sheet_data?.coverPositionX,
    coverPositionY: row.sheet_data?.coverPositionY,
    coverScale: row.sheet_data?.coverScale,
    portraitCrop: row.portrait_crop ?? undefined,
    portraitRotationDegrees: row.sheet_data?.portraitRotationDegrees ?? 0,
    tutore: row.sheet_data?.tutore || '',
    tratti: row.sheet_data?.tratti || [],
    tabOrder: row.sheet_data?.tabOrder || [],
    equipment: row.sheet_data?.equipment || [],
    tipoSpeciale: row.sheet_data?.tipoSpeciale || ''
  };
}

export { mapRowToCharacter };

/**
 * Carica tutti i personaggi di una campagna
 */
export async function loadCharacters(campaignId: string): Promise<(Character & {player: string; notes: string; ownerProfileId: string; ruleset: RulesetId | null})[]> {
  if (shouldUseLocalMode()) {
    return loadLocalCharacters(campaignId);
  }

  if (!supabase) return [];

  const { data, error } = await supabase
    .from('characters')
    .select('*')
    .eq('campaign_id', campaignId)
    .eq('status', 'active')
    .order('created_at', { ascending: true });

  if (error) {
    console.error('Errore caricamento personaggi:', error);
    return [];
  }

  return (data || []).map(mapRowToCharacter);
}

/**
 * Salva un personaggio (create o update)
 */
export async function saveCharacter(
  campaignId: string | null,
  character: Character & {player: string; notes: string},
  ownerProfileId: string,
  ruleset?: RulesetId
): Promise<void> {
  if (shouldUseLocalMode()) {
    await saveLocalCharacter(campaignId, character);
    return;
  }

  if (!supabase) throw new Error('Supabase non configurato');

  const sheetData = {
    player: character.player,
    notes: character.notes,
    description: character.description,
    ambiti: character.ambiti,
    abilita: character.abilita,
    freschezza: character.freschezza,
    maxFreschezza: character.maxFreschezza,
    caselleFrischezzaCruciali: character.caselleFrischezzaCruciali,
    follia: character.follia,
    maxFollia: character.maxFollia,
    conditions: character.conditions,
    turbe: character.turbe,
    audacia: character.audacia,
    prodigi: character.prodigi,
    legame: character.legame,
    linkedCharacterId: character.linkedCharacterId,
    legameDescription: character.legameDescription,
    coverImageUrl: character.coverImageUrl,
    coverPositionX: character.coverPositionX,
    coverPositionY: character.coverPositionY,
    coverScale: character.coverScale,
    tutore: character.tutore,
    tratti: character.tratti,
    tabOrder: (character as any).tabOrder || [],
    equipment: character.equipment,
    tipoSpeciale: character.tipoSpeciale,
    portraitRotationDegrees: character.portraitRotationDegrees ?? 0
  };

  const { error } = await supabase
    .from('characters')
    .upsert({
      id: character.id,
      campaign_id: campaignId,
      owner_profile_id: ownerProfileId,
      ruleset: ruleset ?? null,
      name: character.name,
      style: character.style,
      viaggio: character.viaggio,
      status: 'active',
      portrait_url: character.portraitImageUrl || null,
      background_url: character.coverImageUrl || null,
      portrait_image_url: character.portraitImageUrl ?? null,
      portrait_cropped_image_url: character.portraitCroppedImageUrl ?? null,
      portrait_crop: character.portraitCrop ?? null,
      token_color: character.tokenColor ?? null,
      token_background_color: character.tokenBackgroundColor ?? null,
      token_border_style: character.tokenBorderStyle ?? null,
      token_border_thickness: character.tokenBorderThickness ?? null,
      token_border_label: character.tokenBorderLabel ?? null,
      token_border_visible: character.tokenBorderVisible ?? null,
      sheet_data: sheetData
    });

  if (error) throw error;
}

/**
 * Elimina un personaggio
 */
export async function deleteCharacter(characterId: string): Promise<void> {
  if (shouldUseLocalMode()) {
    await deleteLocalCharacter(characterId);
    return;
  }

  if (!supabase) throw new Error('Supabase non configurato');

  const { error } = await supabase
    .from('characters')
    .delete()
    .eq('id', characterId);

  if (error) throw error;
}

export async function loadCharactersViaServer(
  campaignId: string,
  serverBase: string,
  accessToken: string
): Promise<(Character & {player: string; notes: string; ownerProfileId: string; ruleset: RulesetId | null})[]> {
  const res = await fetch(`${serverBase}/campaigns/${campaignId}/characters`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) return [];
  const { characters: rows } = await res.json();

  return (rows || []).map(mapRowToCharacter);
}

export async function loadCharactersByOwner(ownerProfileId: string): Promise<(Character & {player: string; notes: string; ownerProfileId: string; campaignId: string | null; ruleset: RulesetId | null})[]> {
  if (shouldUseLocalMode()) return [];
  if (!supabase) return [];

  const { data, error } = await supabase
    .from('characters')
    .select('*')
    .eq('owner_profile_id', ownerProfileId)
    .eq('status', 'active')
    .order('created_at', { ascending: true });

  if (error) {
    console.error('Errore caricamento personaggi per proprietario:', error);
    return [];
  }

  return (data || []).map(mapRowToCharacter);
}

export async function updateCharacterCampaign(characterId: string, campaignId: string | null): Promise<void> {
  if (shouldUseLocalMode()) return;
  if (!supabase) throw new Error('Supabase non configurato');
  const { error } = await supabase
    .from('characters')
    .update({ campaign_id: campaignId })
    .eq('id', characterId);
  if (error) throw error;
}

export async function saveCharacterAsGm(
  campaignId: string,
  characterId: string,
  character: Character & { player: string; notes: string },
  serverBase: string,
  accessToken: string
): Promise<void> {
  const sheetData = {
    player: character.player,
    notes: character.notes,
    description: character.description,
    ambiti: character.ambiti,
    abilita: character.abilita,
    freschezza: character.freschezza,
    maxFreschezza: character.maxFreschezza,
    caselleFrischezzaCruciali: character.caselleFrischezzaCruciali,
    follia: character.follia,
    maxFollia: character.maxFollia,
    conditions: character.conditions,
    turbe: character.turbe,
    audacia: character.audacia,
    prodigi: character.prodigi,
    legame: character.legame,
    linkedCharacterId: character.linkedCharacterId,
    legameDescription: character.legameDescription,
    coverImageUrl: character.coverImageUrl,
    coverPositionX: character.coverPositionX,
    coverPositionY: character.coverPositionY,
    coverScale: character.coverScale,
    tutore: character.tutore,
    tratti: character.tratti,
    equipment: character.equipment,
    tipoSpeciale: character.tipoSpeciale,
    portraitRotationDegrees: character.portraitRotationDegrees ?? 0
  };

  const res = await fetch(`${serverBase}/campaigns/${campaignId}/characters/${characterId}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
    body: JSON.stringify({
      name: character.name,
      style: character.style,
      viaggio: character.viaggio,
      portraitUrl: character.portraitImageUrl || null,
      backgroundUrl: character.coverImageUrl || null,
      portraitImageUrl: character.portraitImageUrl ?? null,
      portraitCroppedImageUrl: character.portraitCroppedImageUrl ?? null,
      portraitCrop: character.portraitCrop ?? null,
      tokenColor: character.tokenColor ?? null,
      tokenBackgroundColor: character.tokenBackgroundColor ?? null,
      tokenBorderStyle: character.tokenBorderStyle ?? null,
      tokenBorderThickness: character.tokenBorderThickness ?? null,
      tokenBorderLabel: character.tokenBorderLabel ?? null,
      tokenBorderVisible: character.tokenBorderVisible ?? null,
      sheetData,
    }),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error ?? 'Errore aggiornamento personaggio');
  }
}

export async function deleteCharacterAsGm(
  campaignId: string,
  characterId: string,
  serverBase: string,
  accessToken: string
): Promise<void> {
  const res = await fetch(`${serverBase}/campaigns/${campaignId}/characters/${characterId}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error ?? 'Errore eliminazione personaggio');
  }
}

/**
 * Aggiorna un campo specifico di un personaggio
 */
export async function updateCharacterField(
  characterId: string,
  field: string,
  value: any
): Promise<void> {
  if (shouldUseLocalMode()) {
    const campaignId = '10000000-0000-0000-0000-000000000001';
    const characters = await loadLocalCharacters(campaignId);
    const currentCharacter = characters.find(character => character.id === characterId);

    if (!currentCharacter) {
      return;
    }

    await saveLocalCharacter(campaignId, {
      ...currentCharacter,
      [field]: value
    });

    return;
  }

  if (!supabase) throw new Error('Supabase non configurato');

  const { data: current, error: fetchError } = await supabase
    .from('characters')
    .select('sheet_data')
    .eq('id', characterId)
    .single();

  if (fetchError) throw fetchError;

  const updatedSheetData = {
    ...current.sheet_data,
    [field]: value
  };

  const { error } = await supabase
    .from('characters')
    .update({ sheet_data: updatedSheetData })
    .eq('id', characterId);

  if (error) throw error;
}
