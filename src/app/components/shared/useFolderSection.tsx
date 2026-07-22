import { useEffect, useState } from 'react';
import { projectId } from '/utils/supabase/info';
import {
  loadFolders, createFolder, renameFolder, reorderFolder, deleteFolder, deleteFolderCascade, setFolderParent, setFolderIcon,
  getFolderDepth, getFolderPath, getDescendantFolders, countFolderContentsRecursive, isValidFolderNestTarget, MAX_FOLDER_DEPTH,
  type Folder, type FolderEntityType,
} from '../../../services/supabase/foldersService';
import { useFolderDragDrop, reorderIds } from '../session/shared/useFolderDragDrop';
import { FolderRow } from './FolderRow';
import { UnfiledDropZone } from './UnfiledDropZone';
import { DragGhost } from './DragGhost';

const SERVER_BASE = `https://${projectId}.supabase.co/functions/v1/make-server-771c5bfd`;

// Calcola se questa riga cartella e' il bersaglio corrente di un drag e,
// se lo e', se il drop sarebbe valido - usata sia per lo stile (verde/rosso
// durante il drag) sia, con la stessa funzione isValidFolderNestTarget, come
// guardia finale prima di inviare la richiesta in handleNestFolder: un solo
// punto di verita' chiamato in due momenti diversi del ciclo di vita del drag.
function computeFolderRowDropState(
  dnd: { draggedItem: { kind: 'folder' | 'card'; id: string } | null; dropTarget: { type: string; folderId?: string } | null },
  folder: Folder,
  foldersById: Map<string, Folder>,
): 'none' | 'valid' | 'invalid' {
  const target = dnd.dropTarget;
  if (!target || (target.type !== 'into-folder' && target.type !== 'nest-into-folder') || target.folderId !== folder.id) {
    return 'none';
  }
  if (dnd.draggedItem?.kind !== 'folder') return 'valid'; // card: nessun vincolo di profondita'/ciclo
  return isValidFolderNestTarget(dnd.draggedItem.id, folder.id, foldersById) ? 'valid' : 'invalid';
}

export interface UseFolderSectionParams<T extends { id: string; folderId?: string | null }> {
  entityType: FolderEntityType;
  campaignId: string | null;
  /** Solo per decidere QUANDO ricaricare/resettare il drill-down - tipicamente
   *  session?.user?.id, MAI l'intero oggetto session ne' l'access_token
   *  diretto: la libreria Supabase riemette un nuovo riferimento di sessione
   *  (e a volte ruota legittimamente l'access_token) ad ogni ritorno in
   *  foreground della tab, senza che l'utente sia davvero cambiato - un id
   *  utente stabile evita di azzerare il drill-down a ogni cambio di tab
   *  (bug gia' diagnosticato e corretto altrove in CampaignHome.tsx). */
  sessionKey: string | null;
  /** Valore corrente del token, letto al momento di ogni chiamata HTTP -
   *  puo' cambiare piu' spesso di sessionKey (rotazione legittima) senza che
   *  questo debba far ripartire l'effetto di caricamento/reset. */
  accessToken: string | null;
  /** GM/isOwner - crea/rinomina/elimina/sposta cartelle, gestisce icone.
   *  false = sola lettura (le cartelle si vedono ma non si toccano). */
  canEdit: boolean;
  /** false = questa sezione non e' proprio raggiungibile per l'utente
   *  corrente (es. PNG/Mostri per un giocatore) - niente fetch, folders
   *  resta []. */
  enabled: boolean;
  items: T[];
  renderCard: (item: T) => React.ReactNode;
  /** Versione minimale della card (niente menu ⋮/badge/footer) usata solo
   *  dal ghost di drag (DragGhost) - stesso schema gia' in uso: un ghost non
   *  cliccabile (pointer-events:none sull'antenato) non ha bisogno delle
   *  interazioni della card intera, solo foto/nome/sottotitolo. */
  renderGhostCard: (item: T) => React.ReactNode;
  /** Etichetta per il messaggio "Elimina anche il contenuto: N {itemLabel}"
   *  nel dialog di eliminazione a cascata (es. "Precompilati"/"PNG"/"Mostri"). */
  itemLabel: string;
  /** Assegna/disassegna una card a una cartella - resta al chiamante
   *  (endpoint ed effetti collaterali diversi per PG/PNG/Mostri/altre
   *  entita'). */
  onMoveCard: (itemId: string, folderId: string | null) => void;
  /** Dopo un'eliminazione di cartella l'hook ha gia' aggiornato folders/
   *  navigazione; il chiamante deve ripulire i PROPRI item (folderId=null
   *  sui referenziati per il caso non-cascade, o un reload completo per il
   *  caso cascade) - specifico per entita', l'hook non tocca mai items. */
  onFolderDeleted: (deletedFolderId: string, cascade: boolean) => void | Promise<void>;
  /** Container DOM condiviso tra piu' istanze dell'hook (le diverse sezioni
   *  di una stessa pagina) - stesso containerRef passato a useFolderDragDrop. */
  containerRef?: React.RefObject<HTMLDivElement | null>;
}

export interface UseFolderSectionResult {
  folders: Folder[];
  currentFolderId: string | null;
  setCurrentFolderId: (id: string | null) => void;
  folderPath: Folder[];
  createDisabledReason: string | null;
  handleCreateFolder: () => void;
  dnd: ReturnType<typeof useFolderDragDrop>;
  /** Equivalente dell'odierno corpo di renderFolderedSection (childFolders +
   *  directItems + UnfiledDropZone) - items/renderCard gia' presi dai
   *  parametri dell'hook, non richiesti di nuovo qui. */
  renderRows: () => React.ReactNode;
  /** DragGhost gia' cablato con folders/items/renderCard di questa sezione. */
  renderGhost: () => React.ReactNode;

  itemLabel: string;
  deleteFolderTarget: Folder | null;
  deleteFolderCascadeContent: boolean;
  setDeleteFolderCascadeContent: (v: boolean) => void;
  /** null = cartella vuota (nessun checkbox cascade da mostrare). */
  deleteFolderContents: { itemCount: number; folderCount: number } | null;
  isDeletingFolder: boolean;
  confirmDeleteFolder: () => void;
  cancelDeleteFolder: () => void;

  iconPickerFolder: Folder | null;
  selectFolderIcon: (iconId: string | null) => void;
  closeIconPicker: () => void;
}

/**
 * Incapsula la logica di orchestrazione di una sezione con cartelle
 * (Precompilati/PNG/Mostri in CampaignHome.tsx, in futuro anche
 * SessionCharactersPanel.tsx) - generalizzazione di quella che prima era
 * renderFolderedSection + gli state/handler sparsi nel corpo del componente
 * CampaignHome. Ogni chiamata di questo hook e' un'istanza indipendente
 * (proprio stato di cartelle/navigazione/rinomina/eliminazione/icona) - le
 * uniche cose condivise tra piu' istanze sono il containerRef (passato
 * dall'esterno) e, nel chiamante, eventuali stati specifici dell'entita'
 * (playerRows/npcs/monsters) che restano fuori da qui.
 */
export function useFolderSection<T extends { id: string; folderId?: string | null }>({
  entityType, campaignId, sessionKey, accessToken, canEdit, enabled, items, renderCard, renderGhostCard, itemLabel,
  onMoveCard, onFolderDeleted, containerRef,
}: UseFolderSectionParams<T>): UseFolderSectionResult {
  const [folders, setFolders] = useState<Folder[]>([]);
  const [currentFolderId, setCurrentFolderId] = useState<string | null>(null);
  const [renamingFolderId, setRenamingFolderId] = useState<string | null>(null);
  const [renameFolderDraft, setRenameFolderDraft] = useState('');
  const [deleteFolderTarget, setDeleteFolderTarget] = useState<Folder | null>(null);
  const [deleteFolderCascadeContent, setDeleteFolderCascadeContent] = useState(false);
  const [isDeletingFolder, setIsDeletingFolder] = useState(false);
  const [iconPickerFolder, setIconPickerFolder] = useState<Folder | null>(null);

  // Cambio campagna/utente (o logout) riporta la sezione alla radice -
  // restare "drillati" dentro un id di una campagna/sessione precedente non
  // avrebbe senso. sessionKey (non accessToken) come dipendenza - vedi il
  // commento sul parametro sopra.
  useEffect(() => {
    setCurrentFolderId(null);
    if (!enabled || !campaignId || !sessionKey) {
      setFolders([]);
      return;
    }
    let cancelled = false;
    loadFolders(campaignId, entityType, SERVER_BASE, accessToken ?? '')
      .then((loaded) => { if (!cancelled) setFolders(loaded); })
      .catch((err) => console.error(`Errore caricamento cartelle ${entityType}:`, err));
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [campaignId, sessionKey, enabled, entityType]);

  const foldersById = new Map(folders.map((f) => [f.id, f]));
  const folderPath = getFolderPath(currentFolderId, foldersById);
  const createDisabledReason =
    getFolderDepth(currentFolderId, foldersById) >= MAX_FOLDER_DEPTH
      ? 'Limite di 5 livelli di annidamento raggiunto' : null;

  const handleCreateFolder = async () => {
    if (!campaignId || !accessToken) return;
    try {
      const folder = await createFolder(campaignId, entityType, 'Nuova cartella', SERVER_BASE, accessToken, currentFolderId);
      setFolders((prev) => [...prev, folder]);
      // Entra subito in rinomina, stesso pattern di handleAddCustomTab in
      // useEntityTabs.ts: crea e passa direttamente al nome invece di
      // lasciare "Nuova cartella" come placeholder da rinominare dopo.
      setRenamingFolderId(folder.id);
      setRenameFolderDraft('Nuova cartella');
    } catch (err) {
      console.error('Errore creazione cartella:', err);
    }
  };

  const handleCommitFolderRename = async (folder: Folder) => {
    const name = renameFolderDraft.trim();
    setRenamingFolderId(null);
    if (!name || name === folder.name || !accessToken) return;
    setFolders((prev) => prev.map((f) => (f.id === folder.id ? { ...f, name } : f)));
    try {
      await renameFolder(folder.id, name, SERVER_BASE, accessToken);
    } catch (err) {
      console.error('Errore rinomina cartella:', err);
      setFolders((prev) => prev.map((f) => (f.id === folder.id ? folder : f)));
    }
  };

  // Riordina solo tra i fratelli del nodo trascinato (stesso parentFolderId,
  // incluso il caso radice/null).
  const handleReorderFolders = async (draggedId: string, beforeId: string | null) => {
    if (!accessToken) return;
    const dragged = folders.find((f) => f.id === draggedId);
    if (!dragged) return;
    const siblingIds = folders.filter((f) => f.parentFolderId === dragged.parentFolderId).map((f) => f.id);
    const reorderedSiblingIds = reorderIds(siblingIds, draggedId, beforeId);
    const positionById = new Map(reorderedSiblingIds.map((id, idx) => [id, idx]));
    const byId = new Map(folders.map((f) => [f.id, f]));

    setFolders((prev) => prev.map((f) => (positionById.has(f.id) ? { ...f, position: positionById.get(f.id)! } : f)));

    await Promise.all(
      reorderedSiblingIds.map((id) => {
        const original = byId.get(id);
        const newPosition = positionById.get(id)!;
        if (original && original.position === newPosition) return null;
        return reorderFolder(id, newPosition, SERVER_BASE, accessToken)
          .catch((err) => console.error('Errore riordino cartella:', err));
      })
    );
  };

  // Annida una cartella dentro un'altra o la promuove a radice (null).
  // "Sposta di un livello": se si rilascia una cartella esattamente sopra
  // l'header della cartella che gia' la contiene, si promuove al genitore
  // DI QUEL genitore invece di un no-op - vedi lo stesso principio in
  // FolderBreadcrumb (il penultimo segmento del breadcrumb).
  const handleNestFolder = async (folderId: string, newParentFolderId: string | null) => {
    if (!accessToken) return;
    const original = folders.find((f) => f.id === folderId);
    if (!original) return;
    let resolvedParentId = newParentFolderId;
    if (newParentFolderId !== null && newParentFolderId === original.parentFolderId) {
      const currentParent = folders.find((f) => f.id === newParentFolderId);
      resolvedParentId = currentParent?.parentFolderId ?? null;
    }
    if (resolvedParentId !== null && !isValidFolderNestTarget(folderId, resolvedParentId, foldersById)) return;
    setFolders((prev) => prev.map((f) => (f.id === folderId ? { ...f, parentFolderId: resolvedParentId } : f)));
    try {
      await setFolderParent(folderId, resolvedParentId, SERVER_BASE, accessToken);
    } catch (err) {
      console.error('Errore spostamento cartella:', err);
      setFolders((prev) => prev.map((f) => (f.id === folderId ? original : f)));
    }
  };

  const dnd = useFolderDragDrop({
    canEdit,
    entityType,
    folderIds: folders.map((f) => f.id),
    onReorderFolders: handleReorderFolders,
    onMoveCard,
    onNestFolder: handleNestFolder,
    containerRef,
  });

  const selectFolderIcon = async (iconId: string | null) => {
    const folder = iconPickerFolder;
    setIconPickerFolder(null);
    if (!folder || !accessToken) return;
    setFolders((prev) => prev.map((f) => (f.id === folder.id ? { ...f, icon: iconId } : f)));
    try {
      await setFolderIcon(folder.id, iconId, SERVER_BASE, accessToken);
    } catch (err) {
      console.error('Errore impostazione icona cartella:', err);
      setFolders((prev) => prev.map((f) => (f.id === folder.id ? folder : f)));
    }
  };
  const closeIconPicker = () => setIconPickerFolder(null);

  const deleteFolderContents = (() => {
    if (!deleteFolderTarget) return null;
    const counts = countFolderContentsRecursive(deleteFolderTarget.id, folders, items);
    if (counts.itemCount + counts.folderCount === 0) return null;
    return counts;
  })();

  // Cascade: elimina cartella+sottoalbero+card dentro sul server in un colpo
  // solo (route dedicata) - per un'operazione distruttiva multi-tabella e'
  // piu' semplice e sicuro ricaricare folders da zero che ricostruire a
  // mano quali righe locali rimuovere. Non-cascade: la cartella si scollega
  // soltanto, le sotto-cartelle dirette vengono orfanizzate lato client
  // (il DB lo fa gia' via on delete set null, ma lo stato client no).
  // In entrambi i casi onFolderDeleted lascia al chiamante la pulizia dei
  // PROPRI item (folderId sugli item referenziati, o un reload) - l'hook
  // non tocca mai `items` in scrittura.
  const confirmDeleteFolder = async () => {
    if (!deleteFolderTarget || !accessToken || !campaignId) return;
    setIsDeletingFolder(true);
    const targetId = deleteFolderTarget.id;
    const cascade = deleteFolderCascadeContent;
    try {
      if (cascade) {
        await deleteFolderCascade(targetId, SERVER_BASE, accessToken);
        setFolders(await loadFolders(campaignId, entityType, SERVER_BASE, accessToken));
      } else {
        await deleteFolder(targetId, SERVER_BASE, accessToken);
        setFolders((prev) => prev.filter((f) => f.id !== targetId).map((f) => (f.parentFolderId === targetId ? { ...f, parentFolderId: null } : f)));
      }
      setDeleteFolderTarget(null);
      await onFolderDeleted(targetId, cascade);
    } catch (err) {
      console.error('Errore eliminazione cartella:', err);
    } finally {
      setIsDeletingFolder(false);
    }
  };
  const cancelDeleteFolder = () => setDeleteFolderTarget(null);

  // Un solo livello alla volta (drill-down, vedi FolderBreadcrumb per la
  // navigazione) - solo le sotto-cartelle dirette e le card dirette di
  // currentFolderId, mai l'intero sottoalbero. Le card sciolte (senza
  // cartella) sono le directItems quando si e' alla radice.
  const renderRows = (): React.ReactNode => {
    const childFolders = folders
      .filter((f) => f.parentFolderId === currentFolderId)
      .sort((a, b) => a.position - b.position);
    const directItems = items.filter((it) => (it.folderId ?? null) === currentFolderId);

    return (
      <>
        {childFolders.map((folder) => {
          const counts = countFolderContentsRecursive(folder.id, folders, items);
          const descendantFolders = getDescendantFolders(folder.id, folders);
          return (
            <FolderRow
              key={folder.id}
              folder={folder}
              onEnter={() => setCurrentFolderId(folder.id)}
              count={counts.itemCount}
              descendantFolders={descendantFolders}
              onNavigateTo={(id) => setCurrentFolderId(id)}
              canEdit={canEdit}
              isRenaming={renamingFolderId === folder.id}
              renameDraft={renameFolderDraft}
              onRenameDraftChange={setRenameFolderDraft}
              onStartRename={() => { setRenamingFolderId(folder.id); setRenameFolderDraft(folder.name); }}
              onCommitRename={() => handleCommitFolderRename(folder)}
              onCancelRename={() => setRenamingFolderId(null)}
              onRequestDelete={() => { setDeleteFolderTarget(folder); setDeleteFolderCascadeContent(false); }}
              onOpenIconPicker={() => setIconPickerFolder(folder)}
              onPointerDown={(e) => dnd.handlePointerDown(e, { kind: 'folder', id: folder.id })}
              dropState={computeFolderRowDropState(dnd, folder, foldersById)}
              isDimmed={dnd.draggedItem?.kind === 'folder' && dnd.draggedItem.id === folder.id}
            />
          );
        })}
        {directItems.map((it) => (
          <div
            key={it.id}
            className={
              dnd.draggedItem?.kind === 'card' && dnd.draggedItem.id === it.id ? 'cursor-grabbing opacity-40' : ''
            }
            onPointerDown={(e) => dnd.handlePointerDown(e, { kind: 'card', id: it.id })}
          >
            {renderCard(it)}
          </div>
        ))}
        {currentFolderId === null && childFolders.length > 0 && (
          <UnfiledDropZone entityType={entityType} isDropActive={dnd.dropTarget?.type === 'unfiled'} />
        )}
      </>
    );
  };

  const renderGhost = (): React.ReactNode => (
    <DragGhost dnd={dnd} folders={folders} items={items} renderCard={renderGhostCard} />
  );

  return {
    folders,
    currentFolderId,
    setCurrentFolderId,
    folderPath,
    createDisabledReason,
    handleCreateFolder,
    dnd,
    renderRows,
    renderGhost,
    itemLabel,
    deleteFolderTarget,
    deleteFolderCascadeContent,
    setDeleteFolderCascadeContent,
    deleteFolderContents,
    isDeletingFolder,
    confirmDeleteFolder,
    cancelDeleteFolder,
    iconPickerFolder,
    selectFolderIcon,
    closeIconPicker,
  };
}
