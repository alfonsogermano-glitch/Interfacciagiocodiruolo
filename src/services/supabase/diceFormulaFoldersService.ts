import { supabase } from '../../app/auth/AuthContext';
import type { DiceFormulaFolder, DiceLibraryNodeType } from '../../app/components/session/dice/diceTypes.ts';

interface DiceFormulaFolderRow {
  id: string;
  campaign_id: string;
  owner_profile_id: string;
  name: string;
  icon_name: string | null;
  parent_folder_id: string | null;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

function mapFolder(row: DiceFormulaFolderRow): DiceFormulaFolder {
  return {
    id: row.id,
    campaignId: row.campaign_id,
    ownerProfileId: row.owner_profile_id,
    name: row.name,
    iconName: row.icon_name,
    parentFolderId: row.parent_folder_id,
    sortOrder: row.sort_order,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function validatedFolderName(name: string): string {
  const trimmed = name.trim();
  if (!trimmed) throw new Error('Il nome della cartella non puo essere vuoto.');
  return trimmed;
}

export async function loadDiceFormulaFolders(campaignId: string, ownerProfileId: string): Promise<DiceFormulaFolder[]> {
  const { data, error } = await supabase
    .from('dice_formula_folders')
    .select('*')
    .eq('campaign_id', campaignId)
    .eq('owner_profile_id', ownerProfileId)
    .order('sort_order', { ascending: true })
    .order('created_at', { ascending: true });
  if (error) throw new Error(`Errore caricamento cartelle dadi: ${error.message}`);
  return (data ?? []).map((row) => mapFolder(row as DiceFormulaFolderRow));
}

export async function createDiceFormulaFolder(input: {
  campaignId: string;
  ownerProfileId: string;
  parentFolderId: string | null;
  name: string;
  iconName?: string | null;
}): Promise<DiceFormulaFolder> {
  const { data, error } = await supabase.rpc('create_dice_formula_folder', {
    p_campaign_id: input.campaignId,
    p_owner_profile_id: input.ownerProfileId,
    p_parent_folder_id: input.parentFolderId,
    p_name: validatedFolderName(input.name),
    p_icon_name: input.iconName ?? null,
  });
  if (error) throw new Error(`Errore creazione cartella dadi: ${error.message}`);
  if (!data) throw new Error('La cartella creata non e stata restituita dal server.');
  return mapFolder(data as DiceFormulaFolderRow);
}

export async function updateDiceFormulaFolder(
  id: string,
  patch: { name?: string; iconName?: string | null },
): Promise<DiceFormulaFolder> {
  const payload: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (patch.name !== undefined) payload.name = validatedFolderName(patch.name);
  if (patch.iconName !== undefined) payload.icon_name = patch.iconName;
  const { data, error } = await supabase
    .from('dice_formula_folders')
    .update(payload)
    .eq('id', id)
    .select('*')
    .single();
  if (error) throw new Error(`Errore aggiornamento cartella dadi: ${error.message}`);
  return mapFolder(data as DiceFormulaFolderRow);
}

export async function moveDiceLibraryNode(
  nodeType: DiceLibraryNodeType,
  nodeId: string,
  destinationFolderId: string | null,
  destinationIndex: number,
): Promise<void> {
  const { error } = await supabase.rpc('move_dice_library_node', {
    p_node_type: nodeType,
    p_node_id: nodeId,
    p_destination_folder_id: destinationFolderId,
    p_destination_index: destinationIndex,
  });
  if (error) throw new Error(`Errore spostamento elemento: ${error.message}`);
}

export async function deleteDiceFormulaFolder(folderId: string, deleteContents: boolean): Promise<void> {
  const { error } = await supabase.rpc('delete_dice_formula_folder', {
    p_folder_id: folderId,
    p_delete_contents: deleteContents,
  });
  if (error) throw new Error(`Errore eliminazione cartella dadi: ${error.message}`);
}
