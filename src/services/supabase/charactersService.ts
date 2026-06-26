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

/**
 * Carica tutti i personaggi di una campagna
 */
export async function loadCharacters(campaignId: string): Promise<(Character & {player: string; notes: string; ownerProfileId: string})[]> {
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

  // Converti dal formato database al formato Character
  return (data || []).map(row => ({
    id: row.id,
    name: row.name,
    ownerProfileId: row.owner_profile_id,
    player: row.sheet_data?.player || '',
    notes: row.sheet_data?.notes || '',
    style: row.style || 'Jock',
    viaggio: row.viaggio || 'Campione',
    ambiti: row.sheet_data?.ambiti || { Fisico: 1, Scuola: 1, Carisma: 1, Strada: 1 },
    abilita: row.sheet_data?.abilita || {},
    freschezza: row.sheet_data?.freschezza || 12,
    maxFreschezza: row.sheet_data?.maxFreschezza || 12,
    caselleFrischezzaCruciali: row.sheet_data?.caselleFrischezzaCruciali || [8, 12],
    follia: row.sheet_data?.follia || 9,
    maxFollia: row.sheet_data?.maxFollia || 9,
    conditions: row.sheet_data?.conditions || [],
    turbe: row.sheet_data?.turbe || [],
    audacia: row.sheet_data?.audacia || 1,
    prodigi: row.sheet_data?.prodigi || 0,
    legame: row.sheet_data?.legame || '',
    linkedCharacterId: row.sheet_data?.linkedCharacterId,
    legameDescription: row.sheet_data?.legameDescription,
    coverImageUrl: row.sheet_data?.coverImageUrl,
    portraitImageUrl: row.sheet_data?.portraitImageUrl,
    portraitCroppedImageUrl: row.sheet_data?.portraitCroppedImageUrl,
    coverPositionX: row.sheet_data?.coverPositionX,
    coverPositionY: row.sheet_data?.coverPositionY,
    coverScale: row.sheet_data?.coverScale,
    portraitCrop: row.sheet_data?.portraitCrop,
    tutore: row.sheet_data?.tutore || '',
    tratti: row.sheet_data?.tratti || [],
    equipment: row.sheet_data?.equipment || [],
    tipoSpeciale: row.sheet_data?.tipoSpeciale || ''
  }));
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
    ruleset: ruleset ?? undefined,
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
    portraitImageUrl: character.portraitImageUrl,
    portraitCroppedImageUrl: character.portraitCroppedImageUrl,
    coverPositionX: character.coverPositionX,
    coverPositionY: character.coverPositionY,
    coverScale: character.coverScale,
    portraitCrop: character.portraitCrop,
    tutore: character.tutore,
    tratti: character.tratti,
    equipment: character.equipment,
    tipoSpeciale: character.tipoSpeciale
  };

  const { error } = await supabase
    .from('characters')
    .upsert({
      id: character.id,
      campaign_id: campaignId,
      owner_profile_id: ownerProfileId,
      name: character.name,
      style: character.style,
      viaggio: character.viaggio,
      status: 'active',
      portrait_url: character.portraitImageUrl || null,
      background_url: character.coverImageUrl || null,
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
): Promise<(Character & {player: string; notes: string; ownerProfileId: string})[]> {
  const res = await fetch(`${serverBase}/campaigns/${campaignId}/characters`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) return [];
  const { characters: rows } = await res.json();

  return (rows || []).map((row: any) => ({
    id: row.id,
    name: row.name,
    ownerProfileId: row.owner_profile_id,
    player: row.sheet_data?.player || '',
    notes: row.sheet_data?.notes || '',
    style: row.style || 'Jock',
    viaggio: row.viaggio || 'Campione',
    ambiti: row.sheet_data?.ambiti || { Fisico: 1, Scuola: 1, Carisma: 1, Strada: 1 },
    abilita: row.sheet_data?.abilita || {},
    freschezza: row.sheet_data?.freschezza || 12,
    maxFreschezza: row.sheet_data?.maxFreschezza || 12,
    caselleFrischezzaCruciali: row.sheet_data?.caselleFrischezzaCruciali || [8, 12],
    follia: row.sheet_data?.follia || 9,
    maxFollia: row.sheet_data?.maxFollia || 9,
    conditions: row.sheet_data?.conditions || [],
    turbe: row.sheet_data?.turbe || [],
    audacia: row.sheet_data?.audacia || 1,
    prodigi: row.sheet_data?.prodigi || 0,
    legame: row.sheet_data?.legame || '',
    linkedCharacterId: row.sheet_data?.linkedCharacterId,
    legameDescription: row.sheet_data?.legameDescription,
    coverImageUrl: row.sheet_data?.coverImageUrl,
    portraitImageUrl: row.sheet_data?.portraitImageUrl,
    portraitCroppedImageUrl: row.sheet_data?.portraitCroppedImageUrl,
    coverPositionX: row.sheet_data?.coverPositionX,
    coverPositionY: row.sheet_data?.coverPositionY,
    coverScale: row.sheet_data?.coverScale,
    portraitCrop: row.sheet_data?.portraitCrop,
    tutore: row.sheet_data?.tutore || '',
    tratti: row.sheet_data?.tratti || [],
    equipment: row.sheet_data?.equipment || [],
    tipoSpeciale: row.sheet_data?.tipoSpeciale || ''
  }));
}

export async function loadCharactersByOwner(ownerProfileId: string): Promise<(Character & {player: string; notes: string; ownerProfileId: string; campaignId: string | null})[]> {
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

  return (data || []).map(row => ({
    id: row.id,
    name: row.name,
    ownerProfileId: row.owner_profile_id,
    campaignId: row.campaign_id,
    player: row.sheet_data?.player || '',
    notes: row.sheet_data?.notes || '',
    style: row.style || 'Jock',
    viaggio: row.viaggio || 'Campione',
    ambiti: row.sheet_data?.ambiti || { Fisico: 1, Scuola: 1, Carisma: 1, Strada: 1 },
    abilita: row.sheet_data?.abilita || {},
    freschezza: row.sheet_data?.freschezza || 12,
    maxFreschezza: row.sheet_data?.maxFreschezza || 12,
    caselleFrischezzaCruciali: row.sheet_data?.caselleFrischezzaCruciali || [8, 12],
    follia: row.sheet_data?.follia || 9,
    maxFollia: row.sheet_data?.maxFollia || 9,
    conditions: row.sheet_data?.conditions || [],
    turbe: row.sheet_data?.turbe || [],
    audacia: row.sheet_data?.audacia || 1,
    prodigi: row.sheet_data?.prodigi || 0,
    legame: row.sheet_data?.legame || '',
    linkedCharacterId: row.sheet_data?.linkedCharacterId,
    legameDescription: row.sheet_data?.legameDescription,
    coverImageUrl: row.sheet_data?.coverImageUrl,
    portraitImageUrl: row.sheet_data?.portraitImageUrl,
    portraitCroppedImageUrl: row.sheet_data?.portraitCroppedImageUrl,
    coverPositionX: row.sheet_data?.coverPositionX,
    coverPositionY: row.sheet_data?.coverPositionY,
    coverScale: row.sheet_data?.coverScale,
    portraitCrop: row.sheet_data?.portraitCrop,
    tutore: row.sheet_data?.tutore || '',
    tratti: row.sheet_data?.tratti || [],
    equipment: row.sheet_data?.equipment || [],
    tipoSpeciale: row.sheet_data?.tipoSpeciale || ''
  }));
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
  accessToken: string,
  ruleset?: RulesetId
): Promise<void> {
  const sheetData = {
    player: character.player,
    notes: character.notes,
    ruleset: ruleset ?? undefined,
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
    portraitImageUrl: character.portraitImageUrl,
    portraitCroppedImageUrl: character.portraitCroppedImageUrl,
    coverPositionX: character.coverPositionX,
    coverPositionY: character.coverPositionY,
    coverScale: character.coverScale,
    portraitCrop: character.portraitCrop,
    tutore: character.tutore,
    tratti: character.tratti,
    equipment: character.equipment,
    tipoSpeciale: character.tipoSpeciale
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
