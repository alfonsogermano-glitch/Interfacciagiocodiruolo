import { supabase } from '../../app/auth/AuthContext';
import { validateCustomDieDefinition } from '../../app/components/session/dice/diceCustomDie.ts';
import type { CustomDieFace, CustomDieSides, DiceSkinId, SavedCustomDie } from '../../app/components/session/dice/diceTypes.ts';

interface CustomDieRow {
  id: string;
  campaign_id: string;
  owner_profile_id: string;
  name: string;
  sides: number;
  faces: unknown;
  body_color: string;
  symbol_color: string;
  skin_id?: DiceSkinId | null;
  effects_enabled?: boolean | null;
  icon_name: string | null;
  folder_id: string | null;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

function mapRow(row: CustomDieRow): SavedCustomDie {
  return {
    id: row.id,
    campaignId: row.campaign_id,
    ownerProfileId: row.owner_profile_id,
    name: row.name,
    sides: row.sides as CustomDieSides,
    faces: Array.isArray(row.faces) ? row.faces as CustomDieFace[] : [],
    bodyColor: row.body_color,
    symbolColor: row.symbol_color,
    skinId: row.skin_id ?? 'none',
    effectsEnabled: row.effects_enabled ?? false,
    iconName: row.icon_name,
    folderId: row.folder_id,
    sortOrder: row.sort_order,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function assertValid(die: Pick<SavedCustomDie, 'name' | 'sides' | 'faces'>) {
  const result = validateCustomDieDefinition(die as SavedCustomDie);
  if (!result.valid) throw new Error(result.issues.join(' '));
}

export async function loadCustomDice(campaignId: string, ownerProfileId: string): Promise<SavedCustomDie[]> {
  const { data, error } = await supabase.from('dice_custom_dice').select('*')
    .eq('campaign_id', campaignId).eq('owner_profile_id', ownerProfileId)
    .order('sort_order', { ascending: true }).order('created_at', { ascending: true });
  if (error) throw new Error(`Errore caricamento dadi custom: ${error.message}`);
  return (data ?? []).map((row) => mapRow(row as CustomDieRow));
}

export async function createCustomDie(input: {
  id?: string;
  campaignId: string;
  ownerProfileId: string;
  name: string;
  sides: CustomDieSides;
  faces: CustomDieFace[];
  bodyColor?: string;
  symbolColor?: string;
  skinId?: DiceSkinId;
  effectsEnabled?: boolean;
  iconName?: string | null;
  folderId?: string | null;
}): Promise<SavedCustomDie> {
  assertValid(input as Pick<SavedCustomDie, 'name' | 'sides' | 'faces'>);
  const { data, error } = await supabase.from('dice_custom_dice').insert({
    ...(input.id ? { id: input.id } : {}),
    campaign_id: input.campaignId,
    owner_profile_id: input.ownerProfileId,
    name: input.name.trim(),
    sides: input.sides,
    faces: input.faces,
    body_color: input.bodyColor ?? '#20242f',
    symbol_color: input.symbolColor ?? '#ffffff',
    skin_id: input.skinId ?? 'none',
    effects_enabled: input.effectsEnabled ?? false,
    icon_name: input.iconName ?? null,
    folder_id: input.folderId ?? null,
    sort_order: -1,
  }).select('*').single();
  if (error) throw new Error(`Errore salvataggio dado custom: ${error.message}`);
  return mapRow(data as CustomDieRow);
}

export async function updateCustomDie(
  id: string,
  patch: Partial<Pick<SavedCustomDie, 'name' | 'sides' | 'faces' | 'bodyColor' | 'symbolColor' | 'skinId' | 'effectsEnabled' | 'iconName'>>,
): Promise<SavedCustomDie> {
  if (patch.name !== undefined && !patch.name.trim()) throw new Error('Il nome del dado custom non può essere vuoto.');
  const payload: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (patch.name !== undefined) payload.name = patch.name.trim();
  if (patch.sides !== undefined) payload.sides = patch.sides;
  if (patch.faces !== undefined) payload.faces = patch.faces;
  if (patch.bodyColor !== undefined) payload.body_color = patch.bodyColor;
  if (patch.symbolColor !== undefined) payload.symbol_color = patch.symbolColor;
  if (patch.skinId !== undefined) payload.skin_id = patch.skinId;
  if (patch.effectsEnabled !== undefined) payload.effects_enabled = patch.effectsEnabled;
  if (patch.iconName !== undefined) payload.icon_name = patch.iconName;
  const { data, error } = await supabase.from('dice_custom_dice').update(payload).eq('id', id).select('*').single();
  if (error) throw new Error(`Errore aggiornamento dado custom: ${error.message}`);
  const mapped = mapRow(data as CustomDieRow);
  assertValid(mapped);
  return mapped;
}

export async function deleteCustomDie(id: string): Promise<void> {
  const { error } = await supabase.from('dice_custom_dice').delete().eq('id', id);
  if (error) throw new Error(`Errore eliminazione dado custom: ${error.message}`);
}

export async function duplicateCustomDie(die: SavedCustomDie, name: string): Promise<SavedCustomDie> {
  return createCustomDie({
    campaignId: die.campaignId,
    ownerProfileId: die.ownerProfileId,
    name,
    sides: die.sides,
    faces: die.faces.map((face) => ({ ...face, visual: { ...face.visual } })),
    bodyColor: die.bodyColor,
    symbolColor: die.symbolColor,
    skinId: die.skinId ?? 'none',
    effectsEnabled: die.effectsEnabled ?? false,
    iconName: die.iconName ?? null,
    folderId: die.folderId,
  });
}

export const CUSTOM_DICE_LIBRARY_CHANGED_EVENT = 'hollowgate:dice-custom-library-changed';
export function notifyCustomDiceLibraryChanged() {
  if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent(CUSTOM_DICE_LIBRARY_CHANGED_EVENT));
}
