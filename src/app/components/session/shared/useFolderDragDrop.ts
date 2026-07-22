import { useEffect, useRef, useState } from 'react';

const DRAG_THRESHOLD_PX = 6;

function suppressClickAfterDrag(e: MouseEvent) {
  e.stopPropagation();
  e.preventDefault();
}

export type FolderDragKind = 'folder' | 'card';

// Sentinella per "fuori da qualunque cartella" (area delle card sciolte),
// distinta da un vero id di cartella - stessa idea di 'END' in
// useEntityTabs.ts per "fine della lista" invece di un id di tab. Usata sia
// per le card (torna senza cartella) sia, da Fase 4, per le cartelle stesse
// (torna cartella radice, parentFolderId null).
export const UNFILED_DROP_ID = 'UNFILED' as const;

export type FolderDropTarget =
  | { type: 'reorder-folder'; beforeFolderId: string | null } // null = in coda
  | { type: 'into-folder'; folderId: string }
  | { type: 'nest-into-folder'; folderId: string }
  | { type: 'unfiled' };

interface DraggedItem {
  kind: FolderDragKind;
  id: string;
}

/**
 * Riordina un array spostando `id` prima di `beforeId` (null = in coda).
 * Nessuna mutazione dell'array originale. Funzione pura, nessuna dipendenza
 * da DOM/React - riusata sia dall'hook sotto sia da una verifica manuale
 * isolata (vedi nota nel piano Fase 0). Da Fase 4, il chiamante la invoca
 * solo sul sottoinsieme dei fratelli (stesso parentFolderId) del nodo
 * spostato - l'hook stesso non conosce le relazioni di parentela (vedi
 * onReorderFolders sotto).
 */
export function reorderIds(ids: string[], movedId: string, beforeId: string | null): string[] {
  const next = ids.filter((id) => id !== movedId);
  if (beforeId === null) {
    next.push(movedId);
  } else {
    const idx = next.indexOf(beforeId);
    next.splice(idx === -1 ? next.length : idx, 0, movedId);
  }
  return next;
}

/**
 * Risolve il target di drop dato il punto del puntatore e gli elementi
 * candidati nel DOM - stesso principio del rilevamento a punto-medio di
 * useEntityTabs.ts (data-tab-id + rect.left+width/2), generalizzato a due
 * attributi:
 * - data-folder-id="<id>": riga/chip di una cartella - drop di una card =
 *   'into-folder', drop di un'altra cartella = 'nest-into-folder' (Fase 4:
 *   la cartella trascinata diventa figlia di questa), drop tra due cartelle
 *   (non sopra il rect di nessuna) = 'reorder-folder' prima della piu'
 *   vicina.
 * - data-folder-id="UNFILED": zona delle card sciolte (fuori da ogni
 *   cartella) - drop di una card qui = 'unfiled' (torna senza cartella);
 *   drop di una cartella qui (Fase 4) = 'unfiled' anche per lei (torna
 *   cartella radice, parentFolderId null).
 *
 * Contenimento 2D (clientX+clientY dentro il rect, non solo verticale):
 * FolderRow/UnfiledDropZone sono col-span-2 (una riga = tutta la larghezza
 * del contenitore, quindi X e' banalmente sempre soddisfatto sopra di
 * esse - nessun cambio di comportamento li'), ma da quando FolderBreadcrumb
 * e' diventato un bersaglio di drop piu' segmenti condividono la stessa
 * riga orizzontale: con solo Y, tutti condividerebbero lo stesso
 * rect.top/bottom e il ciclo sotto risolverebbe sempre l'ultimo elemento
 * del DOM in quella fascia, indipendentemente da dove orizzontalmente si
 * rilascia. Il controllo su X li' distingue correttamente i segmenti.
 *
 * data-folder-breadcrumb="true" (solo sui segmenti di FolderBreadcrumb)
 * esclude l'elemento dal calcolo di beforeFolderId (riordino tra fratelli,
 * solo per draggedKind 'folder'): un segmento di breadcrumb rappresenta un
 * antenato, mai un fratello, e senza l'esclusione un riordino nei pressi
 * della riga del breadcrumb potrebbe risolvere beforeFolderId a un id di
 * breadcrumb invece che a un vero fratello. Resta comunque un target
 * valido per overFolderId/overUnfiled.
 *
 * entityType filtra gli elementi candidati a quelli con lo stesso
 * data-folder-entity-type: in CampaignHome.tsx tutte e 4 le sezioni
 * (Personaggi/Precompilati/PNG/Mostri) condividono lo stesso container DOM
 * (un'unica griglia flat, vedi il commento sul markup in CampaignHome.tsx),
 * quindi senza questo filtro trascinare un PG risolverebbe anche le
 * cartelle PNG/Mostri visibili nello stesso momento (filtro 'all') come
 * target validi - il trigger DB bloccherebbe comunque l'assegnazione, ma
 * solo dopo il drop, con un errore silente invece che ignorando il target
 * sbagliato durante il drag stesso.
 */
export function resolveFolderDropTarget(
  clientX: number,
  clientY: number,
  container: HTMLElement,
  draggedKind: FolderDragKind,
  entityType: string,
  draggedId?: string,
): FolderDropTarget | null {
  const els = Array.from(container.querySelectorAll<HTMLElement>('[data-folder-id]'))
    .filter((el) => el.dataset.folderEntityType === entityType);

  let beforeFolderId: string | null = null;
  let overUnfiled = false;
  let overFolderId: string | null = null;

  for (const el of els) {
    const id = el.dataset.folderId as string;
    const rect = el.getBoundingClientRect();
    const mid = rect.top + rect.height / 2;
    const withinRect = clientX >= rect.left && clientX <= rect.right && clientY >= rect.top && clientY <= rect.bottom;

    if (id === UNFILED_DROP_ID) {
      if (withinRect) overUnfiled = true;
      continue;
    }
    if (withinRect) overFolderId = id;
    if (el.dataset.folderBreadcrumb !== 'true' && beforeFolderId === null && clientY < mid) beforeFolderId = id;
  }

  if (draggedKind === 'card') {
    if (overFolderId) return { type: 'into-folder', folderId: overFolderId };
    if (overUnfiled) return { type: 'unfiled' };
    return null; // fuori da qualunque target riconosciuto: nessun'azione al rilascio
  }

  // draggedKind === 'folder': sopra un'altra cartella (non se stessa) = la
  // annida come figlia; sopra la zona sciolte = la rende radice; altrimenti
  // riordino tra fratelli (il trigger DB blocca comunque cicli/profondita'/
  // tipo incoerente lato server - vedi supabase-add-nested-folders.sql,
  // questo e' solo il segnale di intento lato client).
  if (overFolderId && overFolderId !== draggedId) return { type: 'nest-into-folder', folderId: overFolderId };
  if (overUnfiled) return { type: 'unfiled' };
  return { type: 'reorder-folder', beforeFolderId };
}

export interface UseFolderDragDropParams {
  /** Disabilita interamente drag/drop (es. giocatore non-GM: sola vista). */
  canEdit: boolean;
  /** Sezione a cui questa istanza appartiene (es. 'character'/'premade'/
   *  'npc'/'monster') - filtra i target di drop allo stesso valore passato
   *  in data-folder-entity-type sugli elementi di questa sezione, cosi'
   *  piu' istanze possono condividere lo stesso containerRef senza
   *  contaminarsi a vicenda (vedi resolveFolderDropTarget sopra). */
  entityType: string;
  /** Ordine attuale dei SOLI fratelli (stesso parentFolderId) del nodo che
   *  si sta eventualmente riordinando - non piu' l'intero elenco piatto
   *  della sezione (Fase 0): con l'annidamento (Fase 4) l'hook non conosce
   *  le relazioni di parentela, quindi non puo' calcolare da solo chi sono
   *  i fratelli. Il chiamante ricalcola questo array ad ogni render in base
   *  al nodo attualmente trascinato (vedi onReorderFolders sotto). */
  folderIds: string[];
  /** Riordino tra fratelli: grezzo (id trascinato, id davanti a cui va
   *  inserito) invece di un array gia' calcolato - il chiamante conosce le
   *  relazioni di parentela (folder.parentFolderId), l'hook no. Il
   *  chiamante trova i fratelli del nodo trascinato e chiama reorderIds su
   *  quel sottoinsieme. */
  onReorderFolders: (draggedId: string, beforeId: string | null) => void;
  onMoveCard: (cardId: string, folderId: string | null) => void;
  /** Annidamento/promozione di una cartella: newParentFolderId = id di
   *  un'altra cartella (diventa figlia) o null (diventa/torna radice). */
  onNestFolder: (folderId: string, newParentFolderId: string | null) => void;
  /** Container DOM condiviso con altre istanze di questo hook (es. le 4
   *  sezioni di CampaignHome.tsx, che vivono nello stesso grid flat - vedi
   *  il commento sul markup unico in CampaignHome.tsx). Se omesso, l'hook
   *  ne crea uno proprio (comportamento originale, un'istanza indipendente
   *  con il proprio containerRef). */
  containerRef?: React.RefObject<HTMLDivElement | null>;
}

/**
 * Meccanica di drag pointer-based riadattata da useEntityTabs.ts
 * (handlePointerDownTab/handleMove/handleUp) - stessa soglia di movimento
 * prima di considerare avviato un drag (altrimenti un click normale sulla
 * card/cartella verrebbe rubato), stesso schema pointerdown-locale +
 * pointermove/pointerup globali sulla window.
 *
 * Il consumer (CampaignHome.tsx / SessionCharactersPanel.tsx in Fase 2/3,
 * esteso in Fase 5 per l'annidamento) deve:
 * - passare un ref al container che avvolge cartelle+card a
 *   `containerRef` sotto;
 * - marcare ogni riga/chip di cartella con `data-folder-id={folder.id}`
 *   e `data-folder-entity-type={entityType}` (lo stesso valore passato qui
 *   sotto), e la zona delle card sciolte con `data-folder-id="UNFILED"` +
 *   lo stesso `data-folder-entity-type`; un segmento di breadcrumb (o
 *   qualunque bersaglio che non sia una vera riga/fratello nella lista,
 *   es. un salto diretto a un antenato) aggiunge anche
 *   `data-folder-breadcrumb="true"` per restare escluso dal riordino tra
 *   fratelli (vedi resolveFolderDropTarget sopra);
 * - chiamare `handlePointerDown(e, { kind: 'folder', id })` sull'header di
 *   una cartella trascinabile, o `handlePointerDown(e, { kind: 'card', id })`
 *   su una card;
 * - usare `draggedItem`/`dropTarget`/`pointerPosition` solo per lo stile
 *   (evidenziare il target attivo, disegnare un ghost che segue il
 *   puntatore), la logica di persistenza e' gia' applicata automaticamente
 *   al pointerup.
 *
 * Nessuna chiamata di rete qui dentro (a differenza di useEntityTabs.ts, che
 * fa il proprio fetch): la persistenza passa dai tre callback, cosi' questo
 * hook resta verificabile in isolamento (reorderIds/resolveFolderDropTarget
 * sono pure) senza dover mockare fetch/SERVER_BASE.
 */
export function useFolderDragDrop({
  canEdit,
  entityType,
  folderIds,
  onReorderFolders,
  onMoveCard,
  onNestFolder,
  containerRef: externalContainerRef,
}: UseFolderDragDropParams) {
  const [draggedItem, setDraggedItem] = useState<DraggedItem | null>(null);
  const [dropTarget, setDropTarget] = useState<FolderDropTarget | null>(null);
  // Posizione del puntatore durante il drag - solo dato grezzo, nessun
  // rendering qui dentro: il consumer decide se/come disegnare un ghost
  // (portal, stile, contenuto) a partire da questa posizione, stesso
  // principio di "l'hook e' solo meccanica" gia' seguito per
  // draggedItem/dropTarget.
  const [pointerPosition, setPointerPosition] = useState<{ x: number; y: number } | null>(null);
  const ownContainerRef = useRef<HTMLDivElement | null>(null);
  const containerRef = externalContainerRef ?? ownContainerRef;
  const dropTargetRef = useRef<FolderDropTarget | null>(null);
  const pointerStartRef = useRef<{ x: number; y: number; item: DraggedItem } | null>(null);

  const handlePointerDown = (e: React.PointerEvent, item: DraggedItem) => {
    if (!canEdit) return;
    const target = e.target as HTMLElement;
    if (target.closest('[data-no-drag]') || target.closest('input')) return;
    pointerStartRef.current = { x: e.clientX, y: e.clientY, item };
  };

  useEffect(() => {
    const handleMove = (e: PointerEvent) => {
      if (draggedItem) {
        setPointerPosition({ x: e.clientX, y: e.clientY });
        const container = containerRef.current;
        if (!container) return;
        const target = resolveFolderDropTarget(e.clientX, e.clientY, container, draggedItem.kind, entityType, draggedItem.id);
        dropTargetRef.current = target;
        setDropTarget(target);
        return;
      }

      const start = pointerStartRef.current;
      if (!start) return;
      const dx = e.clientX - start.x;
      const dy = e.clientY - start.y;
      if (Math.sqrt(dx * dx + dy * dy) > DRAG_THRESHOLD_PX) {
        setDraggedItem(start.item);
        setPointerPosition({ x: e.clientX, y: e.clientY });
      }
    };

    const handleUp = () => {
      if (draggedItem) {
        // Il browser genera comunque un evento click nativo dopo il
        // pointerup, sull'elemento sotto il cursore al rilascio -
        // indipendentemente dal movimento avvenuto nel mezzo (anche se il
        // rilascio ricade di nuovo sopra la card di partenza). Senza questo,
        // un vero drag apriva comunque la scheda di dettaglio tramite
        // l'onClick di EntityCard. Listener in fase di cattura (prima che
        // l'evento raggiunga il target e risalga fino all'onClick delegato
        // di React) rimosso al primo utilizzo: sopprime solo quel singolo
        // click fantasma, non un click successivo genuino dell'utente.
        window.addEventListener('click', suppressClickAfterDrag, { capture: true, once: true });
        const target = dropTargetRef.current;
        if (target) {
          if (draggedItem.kind === 'folder' && target.type === 'reorder-folder') {
            if (target.beforeFolderId !== draggedItem.id) {
              onReorderFolders(draggedItem.id, target.beforeFolderId);
            }
          } else if (draggedItem.kind === 'folder' && target.type === 'nest-into-folder') {
            onNestFolder(draggedItem.id, target.folderId);
          } else if (draggedItem.kind === 'folder' && target.type === 'unfiled') {
            onNestFolder(draggedItem.id, null);
          } else if (draggedItem.kind === 'card' && target.type === 'into-folder') {
            onMoveCard(draggedItem.id, target.folderId);
          } else if (draggedItem.kind === 'card' && target.type === 'unfiled') {
            onMoveCard(draggedItem.id, null);
          }
        }
        setDraggedItem(null);
        setDropTarget(null);
        setPointerPosition(null);
        dropTargetRef.current = null;
      }
      pointerStartRef.current = null;
    };

    window.addEventListener('pointermove', handleMove);
    window.addEventListener('pointerup', handleUp);
    return () => {
      window.removeEventListener('pointermove', handleMove);
      window.removeEventListener('pointerup', handleUp);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draggedItem, folderIds, entityType]);

  return {
    containerRef,
    draggedItem,
    dropTarget,
    pointerPosition,
    handlePointerDown,
  };
}
