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
    portraitImageUrl: row.portrait_image_url ?? undefined,
    portraitSourceImageUrl: row.portrait_source_image_url ?? undefined,
    portraitCropArea: row.portrait_crop_area ?? undefined,
    portraitAssetId: row.portrait_asset_id ?? undefined,
    // Cornice portrait, cover 16:9 e cornice cover - colonne dedicate
    // (promosse da sheet_data, vedi supabase-add-character-npc-image-extras.sql).
    // coverImageUrl era prima in sheet_data (e specchiato nell'ormai-morta
    // background_url, mai letta): letto qui dalla nuova colonna dedicata,
    // gia' backfillata dalla migrazione.
    portraitFrameAssetId: row.portrait_frame_asset_id ?? null,
    portraitFrameRotationDegrees: row.portrait_frame_rotation_degrees ?? 0,
    portraitFrameOffsetX: row.portrait_frame_offset_x ?? 0,
    portraitFrameOffsetY: row.portrait_frame_offset_y ?? 0,
    portraitFrameScaleX: row.portrait_frame_scale_x ?? 1,
    portraitFrameScaleY: row.portrait_frame_scale_y ?? 1,
    coverImageUrl: row.cover_image_url ?? undefined,
    coverImageScale: row.cover_image_scale ?? 1,
    coverCrop: row.cover_crop ?? undefined,
    coverRotationDegrees: row.cover_rotation_degrees ?? 0,
    frameRotation: row.frame_rotation ?? 0,
    frameRotationDegrees: row.frame_rotation_degrees ?? 0,
    coverFrameOffsetX: row.cover_frame_offset_x ?? 0,
    coverFrameOffsetY: row.cover_frame_offset_y ?? 0,
    coverFrameScaleX: row.cover_frame_scale_x ?? 1,
    coverFrameScaleY: row.cover_frame_scale_y ?? 1,
    coverFrameAssetId: row.cover_frame_asset_id ?? null,
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
 * Copia un personaggio in un'altra campagna (stesso proprietario) - stesso
 * pattern di copyNPCToCampaign/copyMonsterToCampaign in entitiesService.ts.
 */
export async function copyCharacterToCampaign(
  characterId: string,
  targetCampaignId: string,
  ownerProfileId: string
): Promise<void> {
  if (!supabase) throw new Error('Supabase non configurato');

  const { data: original, error: fetchError } = await supabase
    .from('characters')
    .select('*')
    .eq('id', characterId)
    .single();

  if (fetchError || !original) throw fetchError ?? new Error('Personaggio non trovato');

  const { id, created_at, updated_at, owner_profile_id, campaign_id, status, ...rest } = original as any;
  const { error } = await supabase
    .from('characters')
    .insert({ ...rest, campaign_id: targetCampaignId, owner_profile_id: ownerProfileId, status: 'active' });

  if (error) throw error;
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
    tutore: character.tutore,
    tratti: character.tratti,
    tabOrder: (character as any).tabOrder || [],
    equipment: character.equipment,
    tipoSpeciale: character.tipoSpeciale
  };

  const dbData = {
    id: character.id,
    campaign_id: campaignId,
    owner_profile_id: ownerProfileId,
    ruleset: ruleset ?? null,
    name: character.name,
    style: character.style,
    viaggio: character.viaggio,
    status: 'active',
    portrait_url: character.portraitImageUrl || null,
    portrait_image_url: character.portraitImageUrl ?? null,
    portrait_source_image_url: character.portraitSourceImageUrl ?? null,
    portrait_crop_area: character.portraitCropArea ?? null,
    portrait_asset_id: character.portraitAssetId ?? null,
    // Cornice portrait, cover 16:9 e cornice cover - colonne dedicate,
    // stessa struttura di monsters. coverImageUrl era prima specchiato
    // sulla colonna background_url (mai letta da nessun mapper): quella
    // scrittura e' stata rimossa, cover_image_url e' l'unica fonte ora.
    portrait_frame_asset_id: character.portraitFrameAssetId ?? null,
    portrait_frame_rotation_degrees: character.portraitFrameRotationDegrees ?? 0,
    portrait_frame_offset_x: character.portraitFrameOffsetX ?? 0,
    portrait_frame_offset_y: character.portraitFrameOffsetY ?? 0,
    portrait_frame_scale_x: character.portraitFrameScaleX ?? 1,
    portrait_frame_scale_y: character.portraitFrameScaleY ?? 1,
    cover_image_url: character.coverImageUrl || null,
    cover_image_scale: character.coverImageScale ?? 1,
    cover_crop: character.coverCrop ?? null,
    cover_rotation_degrees: character.coverRotationDegrees ?? 0,
    frame_rotation: character.frameRotation ?? 0,
    frame_rotation_degrees: character.frameRotationDegrees ?? 0,
    cover_frame_offset_x: character.coverFrameOffsetX ?? 0,
    cover_frame_offset_y: character.coverFrameOffsetY ?? 0,
    cover_frame_scale_x: character.coverFrameScaleX ?? 1,
    cover_frame_scale_y: character.coverFrameScaleY ?? 1,
    cover_frame_asset_id: character.coverFrameAssetId ?? null,
    token_color: character.tokenColor ?? null,
    token_background_color: character.tokenBackgroundColor ?? null,
    token_border_style: character.tokenBorderStyle ?? null,
    token_border_thickness: character.tokenBorderThickness ?? null,
    token_border_label: character.tokenBorderLabel ?? null,
    token_border_visible: character.tokenBorderVisible ?? null,
    sheet_data: sheetData
  };

  const { error } = await supabase.from('characters').upsert(dbData);

  if (error) {
    // Se una colonna e' troppo recente (migrazione non ancora eseguita),
    // ritenta senza - stesso trattamento gia' riservato alle colonne nuove
    // di monsters/npcs in entitiesService.ts.
    if (
      error.code === 'PGRST204' &&
      (error.message.includes("'portrait_asset_id'") ||
        error.message.includes("'portrait_frame_asset_id'") ||
        error.message.includes("'portrait_frame_rotation_degrees'") ||
        error.message.includes("'portrait_frame_offset_x'") ||
        error.message.includes("'portrait_frame_offset_y'") ||
        error.message.includes("'portrait_frame_scale_x'") ||
        error.message.includes("'portrait_frame_scale_y'") ||
        error.message.includes("'cover_image_url'") ||
        error.message.includes("'cover_image_scale'") ||
        error.message.includes("'cover_crop'") ||
        error.message.includes("'cover_rotation_degrees'") ||
        error.message.includes("'frame_rotation'") ||
        error.message.includes("'frame_rotation_degrees'") ||
        error.message.includes("'cover_frame_offset_x'") ||
        error.message.includes("'cover_frame_offset_y'") ||
        error.message.includes("'cover_frame_scale_x'") ||
        error.message.includes("'cover_frame_scale_y'") ||
        error.message.includes("'cover_frame_asset_id'"))
    ) {
      console.warn('Colonne nuove personaggio (raccolta immagini o cornice+cover) non trovate in Supabase. Salvo temporaneamente senza i nuovi campi - esegui la migrazione SQL per renderli persistenti.', error);

      const {
        portrait_asset_id,
        portrait_frame_asset_id,
        portrait_frame_rotation_degrees,
        portrait_frame_offset_x,
        portrait_frame_offset_y,
        portrait_frame_scale_x,
        portrait_frame_scale_y,
        cover_image_url,
        cover_image_scale,
        cover_crop,
        cover_rotation_degrees,
        frame_rotation,
        frame_rotation_degrees,
        cover_frame_offset_x,
        cover_frame_offset_y,
        cover_frame_scale_x,
        cover_frame_scale_y,
        cover_frame_asset_id,
        ...dataWithoutNewColumns
      } = dbData;
      const { error: retryError } = await supabase.from('characters').upsert(dataWithoutNewColumns);

      if (retryError) throw retryError;
      return;
    }

    throw error;
  }
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

// Wrappa /characters/:id/assign-campaign (supabase/functions/server/index.tsx) -
// a differenza di updateCharacterCampaign qui sopra, l'endpoint gestisce anche
// permessi, compatibilita' ruleset, iscrizione/rimozione da campaign_members
// (KV + Postgres) e il broadcast realtime che tiene sincronizzato il roster
// del GM: va sempre usato per PG con campagna, mai un update diretto via client.
export async function assignCharacterToCampaign(
  characterId: string,
  serverBase: string,
  accessToken: string,
  body: { campaignId: string | null } | { inviteCode: string }
): Promise<{ campaignId: string | null }> {
  const res = await fetch(`${serverBase}/characters/${characterId}/assign-campaign`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
    body: JSON.stringify(body),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error ?? 'Errore durante l\'operazione');
  return data;
}

export async function unassignCharacterFromCampaign(
  characterId: string,
  serverBase: string,
  accessToken: string
): Promise<void> {
  await assignCharacterToCampaign(characterId, serverBase, accessToken, { campaignId: null });
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
      portraitImageUrl: character.portraitImageUrl ?? null,
      portraitSourceImageUrl: character.portraitSourceImageUrl ?? null,
      portraitCropArea: character.portraitCropArea ?? null,
      portraitFrameAssetId: character.portraitFrameAssetId ?? null,
      portraitFrameRotationDegrees: character.portraitFrameRotationDegrees ?? 0,
      portraitFrameOffsetX: character.portraitFrameOffsetX ?? 0,
      portraitFrameOffsetY: character.portraitFrameOffsetY ?? 0,
      portraitFrameScaleX: character.portraitFrameScaleX ?? 1,
      portraitFrameScaleY: character.portraitFrameScaleY ?? 1,
      coverImageUrl: character.coverImageUrl || null,
      coverImageScale: character.coverImageScale ?? 1,
      coverCrop: character.coverCrop ?? null,
      coverRotationDegrees: character.coverRotationDegrees ?? 0,
      frameRotation: character.frameRotation ?? 0,
      frameRotationDegrees: character.frameRotationDegrees ?? 0,
      coverFrameOffsetX: character.coverFrameOffsetX ?? 0,
      coverFrameOffsetY: character.coverFrameOffsetY ?? 0,
      coverFrameScaleX: character.coverFrameScaleX ?? 1,
      coverFrameScaleY: character.coverFrameScaleY ?? 1,
      coverFrameAssetId: character.coverFrameAssetId ?? null,
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
