export type NoteTableContainerGapTarget = 'before' | 'after';

export interface NoteTableContainerGapInput {
  containerType: string;
  parentRole: unknown;
  childIndex: number;
  childCount: number;
  clientY: number;
  top: number;
  bottom: number;
}

export function getNoteTableContainerGapTarget({
  containerType,
  parentRole,
  childIndex,
  childCount,
  clientY,
  top,
  bottom,
}: NoteTableContainerGapInput): NoteTableContainerGapTarget | null {
  if (containerType !== 'textBox' && containerType !== 'collapseBlock') return null;
  if (parentRole !== 'cell' && parentRole !== 'header_cell') return null;
  if (childCount <= 0 || childIndex < 0 || childIndex >= childCount) return null;

  if (clientY < top) return childIndex === 0 ? 'before' : null;
  if (clientY > bottom) return childIndex === childCount - 1 ? 'after' : null;
  return null;
}
