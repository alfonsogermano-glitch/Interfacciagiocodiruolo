// Cartelle per organizzare PG/Precompilati/PNG/Mostri (CampaignHome.tsx).
// Mirror client di entityNotesService.ts: entity_notes/folders non sono mai
// raggiungibili da query dirette del client Supabase, solo dagli endpoint
// REST protetti da canAccessFolders lato server (vedi
// supabase/functions/server/index.tsx).

export type FolderEntityType = 'character' | 'premade' | 'npc' | 'monster';

export interface Folder {
  id: string;
  campaignId: string;
  entityType: FolderEntityType;
  name: string;
  position: number;
  // null = cartella radice. Vedi supabase-add-nested-folders.sql per il
  // trigger che garantisce coerenza di tipo/campagna con la cartella
  // genitore, assenza di cicli e limite di profondita' (5 livelli).
  parentFolderId: string | null;
}

export const MAX_FOLDER_DEPTH = 5;

// Stessa convenzione di conteggio del trigger check_folder_hierarchy
// (supabase-add-nested-folders.sql): la cartella stessa conta come
// profondita' 1, +1 per ogni passo verso la radice. null = profondita' 0.
export function getFolderDepth(folderId: string | null, foldersById: Map<string, Folder>): number {
  let depth = 0;
  let current = folderId;
  const seen = new Set<string>();
  while (current && !seen.has(current)) {
    seen.add(current);
    depth += 1;
    current = foldersById.get(current)?.parentFolderId ?? null;
  }
  return depth;
}

function wouldCreateFolderCycle(draggedFolderId: string, targetFolderId: string, foldersById: Map<string, Folder>): boolean {
  let current: string | null = targetFolderId;
  const seen = new Set<string>();
  while (current && !seen.has(current)) {
    if (current === draggedFolderId) return true;
    seen.add(current);
    current = foldersById.get(current)?.parentFolderId ?? null;
  }
  return false;
}

// Replica esatta di quanto verifica il trigger DB per un singolo
// spostamento folder-into-folder: SOLO la profondita' risultante della
// cartella trascinata dopo il move, NON una verifica ricorsiva dei suoi
// discendenti (il trigger non la fa nemmeno lui - vedi
// supabase-add-nested-folders.sql righe 56-66). Tenere questo scope
// invariato: espanderlo lato client farebbe disaccordare client e server.
export function isValidFolderNestTarget(
  draggedFolderId: string,
  targetFolderId: string,
  foldersById: Map<string, Folder>,
): boolean {
  if (draggedFolderId === targetFolderId) return false;
  if (wouldCreateFolderCycle(draggedFolderId, targetFolderId, foldersById)) return false;
  return getFolderDepth(targetFolderId, foldersById) + 1 <= MAX_FOLDER_DEPTH;
}

function mapFolder(row: any): Folder {
  return {
    id: row.id,
    campaignId: row.campaign_id,
    entityType: row.entity_type,
    name: row.name,
    position: row.position,
    parentFolderId: row.parent_folder_id ?? null,
  };
}

export async function loadFolders(
  campaignId: string,
  entityType: FolderEntityType,
  serverBase: string,
  accessToken: string
): Promise<Folder[]> {
  const res = await fetch(
    `${serverBase}/campaigns/${campaignId}/folders?entityType=${entityType}`,
    { headers: { Authorization: `Bearer ${accessToken}` } }
  );
  const data = await res.json();
  if (!res.ok) throw new Error(data.error ?? 'Errore lettura cartelle');
  return (data.folders ?? []).map(mapFolder);
}

export async function createFolder(
  campaignId: string,
  entityType: FolderEntityType,
  name: string,
  serverBase: string,
  accessToken: string,
  parentFolderId?: string | null,
): Promise<Folder> {
  const res = await fetch(`${serverBase}/campaigns/${campaignId}/folders`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
    body: JSON.stringify({ entityType, name, parentFolderId: parentFolderId ?? null }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error ?? 'Errore creazione cartella');
  return mapFolder(data.folder);
}

export async function renameFolder(
  folderId: string,
  name: string,
  serverBase: string,
  accessToken: string
): Promise<void> {
  const res = await fetch(`${serverBase}/folders/${folderId}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
    body: JSON.stringify({ name }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error ?? 'Errore rinomina cartella');
}

export async function reorderFolder(
  folderId: string,
  position: number,
  serverBase: string,
  accessToken: string
): Promise<void> {
  const res = await fetch(`${serverBase}/folders/${folderId}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
    body: JSON.stringify({ position }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error ?? 'Errore riordino cartella');
}

// Annida una cartella dentro un'altra (parentFolderId) o la promuove a
// radice (null) - usata dal drop "nest-into-folder"/"unfiled" di una
// cartella (Fase 5). Il trigger check_folder_hierarchy lato DB rifiuta
// cicli, profondita' oltre 5 livelli o tipo/campagna incoerente - l'errore
// arriva qui come 400 con il testo della RAISE EXCEPTION (vedi il server).
export async function setFolderParent(
  folderId: string,
  parentFolderId: string | null,
  serverBase: string,
  accessToken: string
): Promise<void> {
  const res = await fetch(`${serverBase}/folders/${folderId}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
    body: JSON.stringify({ parentFolderId }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error ?? 'Errore spostamento cartella');
}

export async function deleteFolder(
  folderId: string,
  serverBase: string,
  accessToken: string
): Promise<void> {
  const res = await fetch(`${serverBase}/folders/${folderId}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error ?? 'Errore eliminazione cartella');
}

// Elimina la cartella E tutto il suo sottoalbero (sotto-cartelle + card
// dentro, ricorsivamente) - route distinta da deleteFolder sopra (che
// orfanizza soltanto), vedi il commento sulla route lato server per il
// perche' non e' un semplice flag. Il chiamante manda solo l'id radice: la
// risoluzione dei discendenti avviene lato server al momento dell'esecuzione,
// non lato client in anticipo.
export async function deleteFolderCascade(
  folderId: string,
  serverBase: string,
  accessToken: string
): Promise<void> {
  const res = await fetch(`${serverBase}/folders/${folderId}/cascade`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error ?? 'Errore eliminazione cartella e contenuto');
}

// PG/Precompilati: unassignCharacterFromCampaign-style, ma stretto sulla sola
// colonna folder_id - vedi POST /characters/:id/folder lato server per il
// perche' non si puo' riusare l'update integrale di saveCharacterAsGm.
export async function setCharacterFolder(
  characterId: string,
  folderId: string | null,
  serverBase: string,
  accessToken: string
): Promise<void> {
  const res = await fetch(`${serverBase}/characters/${characterId}/folder`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
    body: JSON.stringify({ folderId }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error ?? 'Errore assegnazione cartella');
}
