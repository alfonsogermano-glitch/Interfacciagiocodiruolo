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
const observedCampaigns=new Map<string,string>();
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function canonical(formula:SavedDiceFormula,campaignId:string){
  if(!formula||!UUID.test(formula.id)||formula.campaignId!==campaignId||
    typeof formula.name!=='string'||!Array.isArray(formula.items)||
    typeof formula.isSecret!=='boolean')throw Error('Risposta formula non valida');
  observedCampaigns.set(formula.id,campaignId);
  return formula;
}

export async function loadDiceFormulas(campaignId: string, _ownerProfileId: string): Promise<SavedDiceFormula[]> {
  if(!UUID.test(campaignId))throw Error('Campagna formule non valida');
  const result = await request<{ formulas: SavedDiceFormula[] }>(base(campaignId));
  if(!Array.isArray(result.formulas))throw Error('Lista formule non valida');
  const ids=new Set<string>();
  return result.formulas.map(f=>{
    if(ids.has(f.id))throw Error('Formula duplicata');ids.add(f.id);
    return canonical(f,campaignId);
  });
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
  return canonical(result.formula,input.campaignId);
}

export async function updateDiceFormula(id: string, patch: UpdateDiceFormulaPatch): Promise<SavedDiceFormula> {
  const campaignId = observedCampaigns.get(id);
  if (!campaignId) throw new Error('Campagna formule mancante');
  const acknowledgement=await request<{ updated: boolean }>(`${base(campaignId)}/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(patch),
  });
  if(acknowledgement.updated!==true)throw Error('Salvataggio formula non confermato');
  const rows=await loadDiceFormulas(campaignId,'');
  const saved=rows.find(row=>row.id===id);
  if(!saved)throw Error('Formula salvata non rileggibile');
  return saved;
}

export async function deleteDiceFormula(id: string): Promise<void> {
  const campaignId = observedCampaigns.get(id);
  if (!campaignId) throw new Error('Campagna formule mancante');
  const acknowledgement=await request<{ deleted: boolean }>(`${base(campaignId)}/${id}`, { method: 'DELETE' });
  if(acknowledgement.deleted!==true)throw Error('Eliminazione formula non confermata');
  observedCampaigns.delete(id);
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
