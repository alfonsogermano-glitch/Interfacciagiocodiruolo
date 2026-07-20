import { useEffect, useRef, useState } from 'react';

const DRAG_THRESHOLD_PX = 6;

export type FolderDragKind = 'folder' | 'card';

// Sentinella per "fuori da qualunque cartella" (area delle card sciolte),
// distinta da un vero id di cartella - stessa idea di 'END' in
// useEntityTabs.ts per "fine della lista" invece di un id di tab.
export const UNFILED_DROP_ID = 'UNFILED' as const;

export type FolderDropTarget =
  | { type: 'reorder-folder'; beforeFolderId: string | null } // null = in coda
  | { type: 'into-folder'; folderId: string }
  | { type: 'unfiled' };

interface DraggedItem {
  kind: FolderDragKind;
  id: string;
}

/**
 * Riordina un array spostando `id` prima di `beforeId` (null = in coda).
 * Nessuna mutazione dell'array originale. Funzione pura, nessuna dipendenza
 * da DOM/React - riusata sia dall'hook sotto sia da una verifica manuale
 * isolata (vedi nota nel piano Fase 0).
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
 *   'into-folder', drop di un'altra cartella = 'reorder-folder' prima di
 *   questa.
 * - data-folder-id="UNFILED": zona delle card sciolte (fuori da ogni
 *   cartella) - drop di una card qui = 'unfiled', ignorato per il drag di
 *   una cartella (le cartelle non possono "smontarsi").
 *
 * Verticale (clientY) perche' entrambe le superfici target (lista laterale
 * di SessionCharactersPanel.tsx, riga cartelle in cima alla griglia di
 * CampaignHome.tsx) dispongono le cartelle in un'unica colonna/riga - non
 * serve un algoritmo di prossimita' 2D per il caso d'uso reale.
 */
export function resolveFolderDropTarget(
  clientY: number,
  container: HTMLElement,
  draggedKind: FolderDragKind,
): FolderDropTarget | null {
  const els = Array.from(container.querySelectorAll<HTMLElement>('[data-folder-id]'));

  let beforeFolderId: string | null = null;
  let overUnfiled = false;
  let overFolderId: string | null = null;

  for (const el of els) {
    const id = el.dataset.folderId as string;
    const rect = el.getBoundingClientRect();
    const mid = rect.top + rect.height / 2;

    if (id === UNFILED_DROP_ID) {
      if (clientY >= rect.top && clientY <= rect.bottom) overUnfiled = true;
      continue;
    }
    if (clientY >= rect.top && clientY <= rect.bottom) overFolderId = id;
    if (beforeFolderId === null && clientY < mid) beforeFolderId = id;
  }

  if (draggedKind === 'card') {
    if (overFolderId) return { type: 'into-folder', folderId: overFolderId };
    if (overUnfiled) return { type: 'unfiled' };
    return null; // fuori da qualunque target riconosciuto: nessun'azione al rilascio
  }

  // draggedKind === 'folder': solo riordino tra cartelle, mai 'into-folder'
  // (una cartella non puo' entrare in un'altra - nessuna gerarchia richiesta).
  return { type: 'reorder-folder', beforeFolderId };
}

export interface UseFolderDragDropParams {
  /** Disabilita interamente drag/drop (es. giocatore non-GM: sola vista). */
  canEdit: boolean;
  /** Ordine attuale degli id di cartella al primo livello. */
  folderIds: string[];
  onReorderFolders: (order: string[]) => void;
  onMoveCard: (cardId: string, folderId: string | null) => void;
}

/**
 * Meccanica di drag pointer-based riadattata da useEntityTabs.ts
 * (handlePointerDownTab/handleMove/handleUp) - stessa soglia di movimento
 * prima di considerare avviato un drag (altrimenti un click normale sulla
 * card/cartella verrebbe rubato), stesso schema pointerdown-locale +
 * pointermove/pointerup globali sulla window.
 *
 * Il consumer (CampaignHome.tsx / SessionCharactersPanel.tsx in Fase 2/3)
 * deve:
 * - passare un ref al container che avvolge cartelle+card a
 *   `containerRef` sotto;
 * - marcare ogni riga/chip di cartella con `data-folder-id={folder.id}`,
 *   e la zona delle card sciolte con `data-folder-id="UNFILED"`;
 * - chiamare `handlePointerDown(e, { kind: 'folder', id })` sull'header di
 *   una cartella trascinabile, o `handlePointerDown(e, { kind: 'card', id })`
 *   su una card;
 * - usare `draggedItem`/`dropTarget` solo per lo stile (evidenziare il
 *   target attivo durante il drag), la logica di persistenza e' gia'
 *   applicata automaticamente al pointerup.
 *
 * Nessuna chiamata di rete qui dentro (a differenza di useEntityTabs.ts, che
 * fa il proprio fetch): la persistenza passa dai due callback, cosi' questo
 * hook resta verificabile in isolamento (reorderIds/resolveFolderDropTarget
 * sono pure) senza dover mockare fetch/SERVER_BASE.
 */
export function useFolderDragDrop({
  canEdit,
  folderIds,
  onReorderFolders,
  onMoveCard,
}: UseFolderDragDropParams) {
  const [draggedItem, setDraggedItem] = useState<DraggedItem | null>(null);
  const [dropTarget, setDropTarget] = useState<FolderDropTarget | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
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
        const container = containerRef.current;
        if (!container) return;
        const target = resolveFolderDropTarget(e.clientY, container, draggedItem.kind);
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
      }
    };

    const handleUp = () => {
      if (draggedItem) {
        const target = dropTargetRef.current;
        if (target) {
          if (draggedItem.kind === 'folder' && target.type === 'reorder-folder') {
            if (target.beforeFolderId !== draggedItem.id) {
              onReorderFolders(reorderIds(folderIds, draggedItem.id, target.beforeFolderId));
            }
          } else if (draggedItem.kind === 'card' && target.type === 'into-folder') {
            onMoveCard(draggedItem.id, target.folderId);
          } else if (draggedItem.kind === 'card' && target.type === 'unfiled') {
            onMoveCard(draggedItem.id, null);
          }
        }
        setDraggedItem(null);
        setDropTarget(null);
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
  }, [draggedItem, folderIds]);

  return {
    containerRef,
    draggedItem,
    dropTarget,
    handlePointerDown,
  };
}
