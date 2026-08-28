import { supabase } from '../../app/auth/AuthContext';
import { validateDiceFormula } from '../../app/components/session/dice/diceFormulaValidation.ts';
import type {
  DiceFormulaItem,
  SavedDiceFormula,
} from '../../app/components/session/dice/diceTypes.ts';

interface DiceFormulaRow {
  id: string;
  campaign_id: string;
  owner_profile_id: string;
  name: string;
  items: unknown;
  is_secret: boolean;
  created_at: string;
  updated_at: string;
}

export interface CreateDiceFormulaInput {
  campaignId: string;
  ownerProfileId: string;
  name: string;
  items: DiceFormulaItem[];
  isSecret?: boolean;
}

export interface UpdateDiceFormulaPatch {
  name?: string;
  items?: DiceFormulaItem[];
  isSecret?: boolean;
}

function mapRow(row: DiceFormulaRow): SavedDiceFormula {
  return {
    id: row.id,
    campaignId: row.campaign_id,
    ownerProfileId: row.owner_profile_id,
    name: row.name,
    items: Array.isArray(row.items) ? row.items as DiceFormulaItem[] : [],
    isSecret: row.is_secret,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function validatedName(name: string): string {
  const trimmed = name.trim();
  if (!trimmed) throw new Error('Il nome della formula non puo essere vuoto.');
  return trimmed;
}

function assertValidItems(items: DiceFormulaItem[]): void {
  const validation = validateDiceFormula(items);
  if (!validation.valid) {
    throw new Error(validation.issues.map((issue) => issue.message).join(' '));
  }
}

export async function loadDiceFormulas(
  campaignId: string,
  ownerProfileId: string,
): Promise<SavedDiceFormula[]> {
  const { data, error } = await supabase
    .from('dice_formulas')
    .select('*')
    .eq('campaign_id', campaignId)
    .eq('owner_profile_id', ownerProfileId)
    .order('updated_at', { ascending: false });

  if (error) throw new Error(`Errore caricamento formule dadi: ${error.message}`);
  return (data ?? []).map((row) => mapRow(row as DiceFormulaRow));
}

export async function createDiceFormula(input: CreateDiceFormulaInput): Promise<SavedDiceFormula> {
  assertValidItems(input.items);
  const name = validatedName(input.name);

  const { data, error } = await supabase
    .from('dice_formulas')
    .insert({
      campaign_id: input.campaignId,
      owner_profile_id: input.ownerProfileId,
      name,
      items: input.items,
      is_secret: input.isSecret ?? false,
    })
    .select('*')
    .single();

  if (error) throw new Error(`Errore salvataggio formula dadi: ${error.message}`);
  return mapRow(data as DiceFormulaRow);
}

export async function updateDiceFormula(
  id: string,
  patch: UpdateDiceFormulaPatch,
): Promise<SavedDiceFormula> {
  const payload: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
  };

  if (patch.name !== undefined) payload.name = validatedName(patch.name);
  if (patch.items !== undefined) {
    assertValidItems(patch.items);
    payload.items = patch.items;
  }
  if (patch.isSecret !== undefined) payload.is_secret = patch.isSecret;

  const { data, error } = await supabase
    .from('dice_formulas')
    .update(payload)
    .eq('id', id)
    .select('*')
    .single();

  if (error) throw new Error(`Errore aggiornamento formula dadi: ${error.message}`);
  return mapRow(data as DiceFormulaRow);
}

export async function deleteDiceFormula(id: string): Promise<void> {
  const { error } = await supabase
    .from('dice_formulas')
    .delete()
    .eq('id', id);

  if (error) throw new Error(`Errore eliminazione formula dadi: ${error.message}`);
}

export async function duplicateDiceFormula(formula: SavedDiceFormula): Promise<SavedDiceFormula> {
  return createDiceFormula({
    campaignId: formula.campaignId,
    ownerProfileId: formula.ownerProfileId,
    name: `Copia di ${formula.name}`,
    items: formula.items.map((item) => ({ ...item })) as DiceFormulaItem[],
    isSecret: formula.isSecret,
  });
}
