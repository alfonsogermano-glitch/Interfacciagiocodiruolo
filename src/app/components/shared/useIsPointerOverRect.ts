import type { RefObject } from 'react';

/**
 * Confronto geometrico continuo (estratto da SessionCharactersPanel.tsx,
 * Fase 3 del ghost dinamico): vero quando pointerPosition ricade dentro il
 * rect corrente di ref.current. Va richiamato ad ogni render mentre un drag
 * e' in corso (pointerPosition e' stato React aggiornato ad ogni
 * pointermove, vedi useFolderDragDrop.ts) - nessuno stato/effetto interno
 * qui, solo lettura sincrona di getBoundingClientRect(), cosi' resta valido
 * anche se il layout cambia durante il drag stesso (scroll, resize).
 *
 * ref assente (nessun elemento a cui confrontare) = false, non un errore:
 * il chiamante decide cosa significa "non posso saperlo" nel proprio
 * contesto (vedi listColumnRef opzionale in useFolderSection.tsx).
 */
export function useIsPointerOverRect(
  ref: RefObject<HTMLElement | null> | undefined,
  pointerPosition: { x: number; y: number } | null,
): boolean {
  const el = ref?.current;
  if (!pointerPosition || !el) return false;
  const rect = el.getBoundingClientRect();
  return (
    pointerPosition.x >= rect.left && pointerPosition.x <= rect.right
    && pointerPosition.y >= rect.top && pointerPosition.y <= rect.bottom
  );
}
