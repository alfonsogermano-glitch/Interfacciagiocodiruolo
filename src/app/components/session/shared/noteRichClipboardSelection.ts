import { Slice } from '@tiptap/pm/model';
import type { EditorState } from '@tiptap/pm/state';
import { CellSelection } from '@tiptap/pm/tables';

function singleSelectedCellContent(selection: CellSelection): Slice | null {
  if (selection.$anchorCell.pos !== selection.$headCell.pos) return null;
  const cell = selection.$anchorCell.nodeAfter;
  if (!cell) return null;
  const tableRole = cell.type.spec.tableRole;
  if (tableRole !== 'cell' && tableRole !== 'header_cell') return null;
  return new Slice(cell.content, 0, 0);
}

export function isRichClipboardTableSelection(state: EditorState): boolean {
  return state.selection instanceof CellSelection;
}

/**
 * A one-cell CellSelection is only an editing affordance: copying it should
 * place the contents of that cell on the rich clipboard, not the surrounding
 * table row/cell wrapper ProseMirror adds to the selection Slice.
 *
 * Multi-cell selections intentionally retain their native table structure.
 */
export function getRichClipboardSlice(state: EditorState): Slice {
  if (state.selection instanceof CellSelection) {
    const singleCell = singleSelectedCellContent(state.selection);
    if (singleCell) return singleCell;
  }
  return state.selection.content();
}
