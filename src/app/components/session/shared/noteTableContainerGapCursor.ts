import { GapCursor } from '@tiptap/pm/gapcursor';
import type { Node as PMNode, ResolvedPos } from '@tiptap/pm/model';
import { Selection, TextSelection, type EditorState } from '@tiptap/pm/state';
import { TableMap } from '@tiptap/pm/tables';

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


export function isValidNoteTableGapCursor($pos: ResolvedPos): boolean {
  return (GapCursor as unknown as { valid: (pos: ResolvedPos) => boolean }).valid($pos);
}

type VerticalDirection = -1 | 1;
type EndOfTextblock = (direction: 'up' | 'down') => boolean;

interface TableCellContext {
  cell: PMNode;
  cellPos: number;
  table: PMNode;
  tableStart: number;
  relativeCellPos: number;
}

function isStructuralContainer(node: PMNode | null | undefined): node is PMNode {
  return Boolean(node && (node.type.name === 'textBox' || node.type.name === 'collapseBlock'));
}

function soleStructuralContainer(cell: PMNode): PMNode | null {
  if (cell.childCount !== 1) return null;
  const child = cell.firstChild;
  return isStructuralContainer(child) ? child : null;
}

function findTableCellContext($pos: ResolvedPos): TableCellContext | null {
  let cellDepth = -1;
  for (let depth = $pos.depth; depth >= 1; depth -= 1) {
    const role = $pos.node(depth).type.spec.tableRole;
    if (role === 'cell' || role === 'header_cell') {
      cellDepth = depth;
      break;
    }
  }
  if (cellDepth < 1) return null;

  let tableDepth = -1;
  for (let depth = cellDepth - 1; depth >= 1; depth -= 1) {
    if ($pos.node(depth).type.spec.tableRole === 'table') {
      tableDepth = depth;
      break;
    }
  }
  if (tableDepth < 1) return null;

  const cell = $pos.node(cellDepth);
  const cellPos = $pos.before(cellDepth);
  const table = $pos.node(tableDepth);
  const tableStart = $pos.start(tableDepth);
  return {
    cell,
    cellPos,
    table,
    tableStart,
    relativeCellPos: cellPos - tableStart,
  };
}

function cellAtVerticalTextEdge(
  state: EditorState,
  dir: VerticalDirection,
  endOfTextblock: EndOfTextblock,
): TableCellContext | null {
  const selection = state.selection;
  if (!(selection instanceof TextSelection) || !selection.empty) return null;

  const { $head } = selection;
  for (let depth = $head.depth - 1; depth >= 0; depth -= 1) {
    const parent = $head.node(depth);
    const index = dir < 0 ? $head.index(depth) : $head.indexAfter(depth);
    if (index !== (dir < 0 ? 0 : parent.childCount)) return null;

    const role = parent.type.spec.tableRole;
    if (role === 'cell' || role === 'header_cell') {
      if (!endOfTextblock(dir > 0 ? 'down' : 'up')) return null;
      return findTableCellContext($head);
    }
  }
  return null;
}

function verticalNeighborCell(context: TableCellContext, dir: VerticalDirection): TableCellContext | null {
  const map = TableMap.get(context.table);
  const relativeCellPos = map.nextCell(context.relativeCellPos, 'vert', dir);
  if (relativeCellPos == null) return null;

  const cell = context.table.nodeAt(relativeCellPos);
  if (!cell) return null;
  const role = cell.type.spec.tableRole;
  if (role !== 'cell' && role !== 'header_cell') return null;

  return {
    cell,
    cellPos: context.tableStart + relativeCellPos,
    table: context.table,
    tableStart: context.tableStart,
    relativeCellPos,
  };
}

function structuralGapSelection(
  state: EditorState,
  context: TableCellContext,
  side: NoteTableContainerGapTarget,
): GapCursor | null {
  const structural = soleStructuralContainer(context.cell);
  if (!structural) return null;
  const containerPos = context.cellPos + 1;
  const gapPos = side === 'before' ? containerPos : containerPos + structural.nodeSize;
  const $gap = state.doc.resolve(gapPos);
  return isValidNoteTableGapCursor($gap) ? new GapCursor($gap) : null;
}

/**
 * Gives the table-specific structural gaps a keyboard path that mirrors the
 * mouse path. ProseMirror's table plugin otherwise moves a vertical arrow
 * straight to Selection.near(nextCell), which skips the before/after gap of a
 * cell whose only direct child is a TextBox/Collapse.
 *
 * Returning null deliberately leaves ordinary arrow motion to ProseMirror.
 */
export function getNoteTableContainerArrowSelection(
  state: EditorState,
  dir: VerticalDirection,
  endOfTextblock: EndOfTextblock,
): Selection | null {
  const selection = state.selection;

  if (selection instanceof TextSelection) {
    const current = cellAtVerticalTextEdge(state, dir, endOfTextblock);
    if (!current) return null;

    // First expose the gap in the CURRENT cell. This is the missing keyboard
    // step when the cell is entirely occupied by one structural container.
    const currentGap = structuralGapSelection(state, current, dir > 0 ? 'after' : 'before');
    if (currentGap) return currentGap;

    // For an ordinary current cell, entering a structural-only neighbour must
    // land on its outer gap instead of jumping directly into its inner text.
    const next = verticalNeighborCell(current, dir);
    if (!next) return null;
    return structuralGapSelection(state, next, dir > 0 ? 'before' : 'after');
  }

  if (selection instanceof GapCursor) {
    const current = findTableCellContext(selection.$head);
    if (!current) return null;
    const structural = soleStructuralContainer(current.cell);
    if (!structural) return null;

    const containerPos = current.cellPos + 1;
    const before = containerPos;
    const after = containerPos + structural.nodeSize;
    const movingOutward = (dir < 0 && selection.head === before) || (dir > 0 && selection.head === after);
    if (!movingOutward) return null;

    const next = verticalNeighborCell(current, dir);
    if (!next) return null;
    const nextStructuralGap = structuralGapSelection(state, next, dir > 0 ? 'before' : 'after');
    if (nextStructuralGap) return nextStructuralGap;

    // TableEditing uses Selection.near(nextCell, 1) for ordinary vertical
    // travel. Mirror that here because its own handler only accepts a
    // TextSelection and would otherwise leave a GapCursor stranded.
    return Selection.near(state.doc.resolve(next.cellPos), 1);
  }

  return null;
}
