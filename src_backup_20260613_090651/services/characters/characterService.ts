import { supabase } from '../../lib/supabaseClient';
import {
  mapCharacterRow,
  mapCharacterSummary
} from '../../lib/mappers/characterMappers';

import type { CharacterRow } from '../../types/database';
import type {
  CharacterRecord,
  CharacterSummary,
  CreateCharacterInput,
  UpdateCharacterInput
} from '../../types/character';

function normalizeCharacterCreatePayload(input: CreateCharacterInput) {
  return {
    campaign_id: input.campaignId,
    owner_profile_id: input.ownerProfileId,

    name: input.name.trim(),
    style: input.style ?? null,
    journey: input.viaggio ?? null,
    status: input.status ?? 'draft',

    portrait_url: input.portraitUrl ?? null,
    background_url: input.backgroundUrl ?? null,

    sheet_data: input.sheetData ?? {}
  };
}

function normalizeCharacterUpdatePayload(patch: UpdateCharacterInput) {
  const payload: Record<string, unknown> = {};

  if (patch.name !== undefined) {
    payload.name = patch.name.trim();
  }

  if (patch.style !== undefined) {
    payload.style = patch.style ?? null;
  }

  if (patch.viaggio !== undefined) {
    payload.journey = patch.viaggio ?? null;
  }

  if (patch.status !== undefined) {
    payload.status = patch.status;
  }

  if (patch.portraitUrl !== undefined) {
    payload.portrait_url = patch.portraitUrl ?? null;
  }

  if (patch.backgroundUrl !== undefined) {
    payload.background_url = patch.backgroundUrl ?? null;
  }

  if (patch.sheetData !== undefined) {
    payload.sheet_data = patch.sheetData;
  }

  return payload;
}

/**
 * Restituisce un personaggio singolo per id.
 */
export async function getCharacterById(
  characterId: string
): Promise<CharacterRecord> {
  const { data, error } = await supabase
    .from('characters')
    .select('*')
    .eq('id', characterId)
    .single();

  if (error || !data) {
    throw new Error(
      `Errore nel recupero del personaggio: ${error?.message ?? 'Personaggio non trovato'}`
    );
  }

  return mapCharacterRow(data as CharacterRow);
}

/**
 * Restituisce tutti i personaggi di una campagna.
 */
export async function getCharactersByCampaign(
  campaignId: string
): Promise<CharacterSummary[]> {
  const { data, error } = await supabase
    .from('characters')
    .select('*')
    .eq('campaign_id', campaignId)
    .order('updated_at', { ascending: false });

  if (error) {
    throw new Error(
      `Errore nel recupero dei personaggi della campagna: ${error.message}`
    );
  }

  return (data as CharacterRow[]).map(mapCharacterSummary);
}

/**
 * Restituisce tutti i personaggi posseduti da un utente.
 */
export async function getCharactersByOwner(
  ownerProfileId: string
): Promise<CharacterSummary[]> {
  const { data, error } = await supabase
    .from('characters')
    .select('*')
    .eq('owner_profile_id', ownerProfileId)
    .order('updated_at', { ascending: false });

  if (error) {
    throw new Error(
      `Errore nel recupero dei personaggi dell'utente: ${error.message}`
    );
  }

  return (data as CharacterRow[]).map(mapCharacterSummary);
}

/**
 * Crea un nuovo personaggio.
 */
export async function createCharacter(
  input: CreateCharacterInput
): Promise<CharacterRecord> {
  const payload = normalizeCharacterCreatePayload(input);

  const { data, error } = await supabase
    .from('characters')
    .insert(payload)
    .select('*')
    .single();

  if (error || !data) {
    throw new Error(
      `Errore nella creazione del personaggio: ${error?.message ?? 'Creazione fallita'}`
    );
  }

  return mapCharacterRow(data as CharacterRow);
}

/**
 * Aggiorna un personaggio esistente.
 */
export async function updateCharacter(
  id: string,
  patch: UpdateCharacterInput
): Promise<CharacterRecord> {
  const payload = {
    ...normalizeCharacterUpdatePayload(patch),
    updated_at: new Date().toISOString()
  };

  const { data, error } = await supabase
    .from('characters')
    .update(payload)
    .eq('id', id)
    .select('*')
    .single();

  if (error || !data) {
    throw new Error(
      `Errore nell'aggiornamento del personaggio: ${error?.message ?? 'Aggiornamento fallito'}`
    );
  }

  return mapCharacterRow(data as CharacterRow);
}

/**
 * Archivia logicamente un personaggio senza cancellarlo.
 */
export async function archiveCharacter(id: string): Promise<CharacterRecord> {
  const { data, error } = await supabase
    .from('characters')
    .update({
      status: 'archived',
      updated_at: new Date().toISOString()
    })
    .eq('id', id)
    .select('*')
    .single();

  if (error || !data) {
    throw new Error(
      `Errore nell'archiviazione del personaggio: ${error?.message ?? 'Archiviazione fallita'}`
    );
  }

  return mapCharacterRow(data as CharacterRow);
}

/**
 * Riporta un personaggio in stato attivo.
 */
export async function restoreCharacter(id: string): Promise<CharacterRecord> {
  const { data, error } = await supabase
    .from('characters')
    .update({
      status: 'active',
      updated_at: new Date().toISOString()
    })
    .eq('id', id)
    .select('*')
    .single();

  if (error || !data) {
    throw new Error(
      `Errore nel ripristino del personaggio: ${error?.message ?? 'Ripristino fallito'}`
    );
  }

  return mapCharacterRow(data as CharacterRow);
}

/**
 * Elimina definitivamente un personaggio.
 * Da usare con cautela: rimuove anche l'equipaggiamento associato per via del cascade.
 */
export async function deleteCharacter(id: string): Promise<void> {
  const { error } = await supabase
    .from('characters')
    .delete()
    .eq('id', id);

  if (error) {
    throw new Error(
      `Errore nell'eliminazione del personaggio: ${error.message}`
    );
  }
}