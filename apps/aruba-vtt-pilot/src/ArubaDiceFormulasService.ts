// Dice formulas persistence for Aruba pilot.
import type {DiceFormulaItem,SavedDiceFormula} from '../../../src/app/components/session/dice/diceTypes';

export interface CreateDiceFormulaInput {
  campaignId: string;
  ownerProfileId: string;
  name: string;
  items: DiceFormulaItem[];
  isSecret?: boolean;
  iconName?: string | null;
  folderId?: string | null;
}

export interface UpdateDiceFormulaPatch {
  name?: string;
  items?: DiceFormulaItem[];
  isSecret?: boolean;
  iconName?: string | null;
}

const request = async <T>(path: string, init: RequestInit = {}): Promise<T> => {
  const response = await fetch(path, {
    credentials: 'same-origin',
    cache: 'no-store',
    redirect: 'error',
    ...init,
    headers: {
      accept: 'application/json',
      ...(init.body ? { 'content-type': 'application/json' } : {}),
      ...init.headers,
    },
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error ?? 'Formule dadi non disponibili');
  return data;
};

const base = (campaignId: string) => `/vtt/campaigns/${campaignId}/dice-formulas`;

export async function loadDiceFormulas(campaignId: string, _ownerProfileId: string): Promise<SavedDiceFormula[]> {
  const result = await request<{ formulas: SavedDiceFormula[] }>(base(campaignId));
  return result.formulas;
}

export async function createDiceFormula(input: CreateDiceFormulaInput): Promise<SavedDiceFormula> {
  const result = await request<{ formula: SavedDiceFormula }>(base(input.campaignId), {
    method: 'POST',
    body: JSON.stringify({
      name: input.name,
      items: input.items,
      isSecret: input.isSecret ?? false,
      iconName: input.iconName ?? null,
    }),
  });
  return result.formula;
}

export async function updateDiceFormula(id: string, patch: UpdateDiceFormulaPatch): Promise<SavedDiceFormula> {
  const campaignId = sessionStorage.getItem('hollowgate.aruba.dice-campaign');
  if (!campaignId) throw new Error('Campagna formule mancante');
  await request<{ updated: boolean }>(`${base(campaignId)}/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(patch),
  });
  // Service returns only confirmation; return a stub with updated fields
  return { id, campaignId, ownerProfileId: '', name: patch.name ?? '', items: patch.items ?? [], isSecret: patch.isSecret ?? false, iconName: patch.iconName ?? null, folderId: null, sortOrder: 0, createdAt: '', updatedAt: new Date().toISOString() };
}

export async function deleteDiceFormula(id: string): Promise<void> {
  const campaignId = sessionStorage.getItem('hollowgate.aruba.dice-campaign');
  if (!campaignId) throw new Error('Campagna formule mancante');
  await request<{ deleted: boolean }>(`${base(campaignId)}/${id}`, { method: 'DELETE' });
}

export async function duplicateDiceFormula(formula: SavedDiceFormula): Promise<SavedDiceFormula> {
  return createDiceFormula({
    campaignId: formula.campaignId,
    ownerProfileId: formula.ownerProfileId,
    name: `Copia di ${formula.name}`,
    items: formula.items.map((item) => ({ ...item })) as DiceFormulaItem[],
    isSecret: formula.isSecret,
    iconName: formula.iconName,
  });
}

export async function reorderDiceFormulas(campaignId: string, ids: string[]): Promise<void> {
  await request<{ reordered: boolean }>(`${base(campaignId)}/reorder`, {
    method: 'POST',
    body: JSON.stringify({ ids }),
  });
}

export function setArubaDiceCampaign(campaignId: string): void {
  sessionStorage.setItem('hollowgate.aruba.dice-campaign', campaignId);
}
