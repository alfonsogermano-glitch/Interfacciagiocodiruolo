import {createArubaOriginalFolderTransport} from './ArubaOriginalFolderTransport.mjs';

/** Export the exact ORIGINAL pure folder utilities. This source is copied
 * verbatim from foldersService.ts, without its Supabase transport imports.
 * Only useFolderSection.tsx in the Aruba pilot is remapped to this adapter. */
export type FolderEntityType = 'character' | 'premade' | 'npc' | 'monster' | 'gmnotes' | 'campaignnotes';

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
  // null = icona predefinita (Folder) - id da folderIconCatalog.ts, non
  // validato qui: getFolderIconComponent ricade sul default per un id
  // sconosciuto/rimosso dal set curato, invece di rompere il render.
  icon: string | null;
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

// Tutti i discendenti (a qualunque profondita'), non solo i figli diretti -
// usata per le scorciatoie di navigazione su FolderRow. Pre-order
// depth-first, ordinato per position a ogni livello (stesso criterio gia'
// usato per childFolders in renderFolderedSection): una cartella e' seguita
// subito dai suoi figli, ordine di lettura gerarchica invece che
// alfabetico piatto. Nessuna protezione da cicli: la gerarchia e' gia'
// garantita aciclica dal trigger check_folder_hierarchy lato DB.
export function getDescendantFolders(folderId: string, folders: Folder[]): Folder[] {
  const children = folders
    .filter((f) => f.parentFolderId === folderId)
    .sort((a, b) => a.position - b.position);
  return children.flatMap((child) => [child, ...getDescendantFolders(child.id, folders)]);
}

// Catena radice→corrente (esclusa la radice, rappresentata dall'etichetta
// di sezione nel breadcrumb) per il drill-down - si ferma anche su un id
// stantio (es. cartella cancellata altrove) invece di andare in loop o
// lanciare, il breadcrumb si tronca semplicemente li'.
export function getFolderPath(folderId: string | null, foldersById: Map<string, Folder>): Folder[] {
  const path: Folder[] = [];
  let current = folderId;
  const seen = new Set<string>();
  while (current && !seen.has(current)) {
    const folder = foldersById.get(current);
    if (!folder) break;
    path.unshift(folder);
    seen.add(current);
    current = folder.parentFolderId;
  }
  return path;
}

// Conteggio ricorsivo (sotto-cartelle+card annidate incluse), scomposto
// per tipo - usato sia per il badge "(n)" sulla riga cartella (solo
// itemCount, con la vista drill-down che nasconde il contenuto finche' non
// ci si entra un "(0)" su una cartella che in realta' contiene nipoti
// sarebbe fuorviante) sia per il messaggio di eliminazione a cascata
// (entrambi i conteggi, per un avviso tipo "3 PNG e 2 sotto-cartelle").
export function countFolderContentsRecursive(
  folderId: string,
  folders: Folder[],
  items: { folderId?: string | null }[],
): { itemCount: number; folderCount: number } {
  const directItems = items.filter((it) => it.folderId === folderId).length;
  const childFolders = folders.filter((f) => f.parentFolderId === folderId);
  return childFolders.reduce((acc, child) => {
    const sub = countFolderContentsRecursive(child.id, folders, items);
    return { itemCount: acc.itemCount + sub.itemCount, folderCount: acc.folderCount + sub.folderCount + 1 };
  }, { itemCount: directItems, folderCount: 0 });
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


const bridge=createArubaOriginalFolderTransport(fetch);
export const {
 loadFolders,createFolder,renameFolder,reorderFolder,
 setFolderParent,setFolderIcon,deleteFolder,deleteFolderCascade,
}=bridge;

// Character folder assignment is not a Campaign Note operation.
// Fail closed if an unexpected original caller reaches this adapter.
export async function setCharacterFolder():Promise<never>{
 throw Error('Cartelle personaggio non disponibili in questo adapter Aruba');
}
