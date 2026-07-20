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
}

function mapFolder(row: any): Folder {
  return {
    id: row.id,
    campaignId: row.campaign_id,
    entityType: row.entity_type,
    name: row.name,
    position: row.position,
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
  accessToken: string
): Promise<Folder> {
  const res = await fetch(`${serverBase}/campaigns/${campaignId}/folders`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
    body: JSON.stringify({ entityType, name }),
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
