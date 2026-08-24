import { Extension, type Extensions } from '@tiptap/core';
import { TableKit, TableCell, TableHeader } from '@tiptap/extension-table';
import type { Node as PMNode } from '@tiptap/pm/model';
import type { EditorState } from '@tiptap/pm/state';
import { canInsertNoteContainer } from './noteContainerPolicy';

export const NOTE_TABLE_CELL_CONTENT =
  '(paragraph | bulletList | orderedList | blockquote | horizontalRule | image | taskList | textBox | collapseBlock)+';

export const HollowgateTableCell = TableCell.extend({ content: NOTE_TABLE_CELL_CONTENT });
export const HollowgateTableHeader = TableHeader.extend({ content: NOTE_TABLE_CELL_CONTENT });

export interface ActiveNoteTable {
  node: PMNode;
  pos: number;
  depth: number;
}

export function findActiveTable(state: EditorState): ActiveNoteTable | null {
  const { $from } = state.selection;
  for (let depth = $from.depth; depth >= 1; depth -= 1) {
    const node = $from.node(depth);
    if (node.type.name === 'table') return { node, pos: $from.before(depth), depth };
  }
  return null;
}

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    noteTable: {
      insertNoteTable: () => ReturnType;
      toggleNoteTableGrid: () => ReturnType;
    };
  }
}

export const NoteTableCommands = Extension.create({
  name: 'noteTableCommands',

  addGlobalAttributes() {
    return [{
      types: ['table'],
      attributes: {
        gridVisible: {
          default: true,
          parseHTML: (element) => element.getAttribute('data-grid-visible') !== 'false',
          renderHTML: (attributes) => ({ 'data-grid-visible': attributes.gridVisible !== false ? 'true' : 'false' }),
        },
      },
    }];
  },

  addCommands() {
    return {
      insertNoteTable:
        () =>
        ({ commands, state, editor }) => {
          if (!editor.isEditable) return false;
          const decision = canInsertNoteContainer(state.selection.$from, 'table');
          if (!decision.allowed) return false;
          return commands.insertTable({ rows: 3, cols: 3, withHeaderRow: false });
        },
      toggleNoteTableGrid:
        () =>
        ({ state, tr, dispatch, editor }) => {
          if (!editor.isEditable) return false;
          const active = findActiveTable(state);
          if (!active) return false;
          if (dispatch) {
            tr.setNodeMarkup(active.pos, undefined, {
              ...active.node.attrs,
              gridVisible: active.node.attrs.gridVisible === false,
            });
          }
          return true;
        },
    };
  },
});

export const NOTE_TABLE_EXTENSIONS: Extensions = [
  TableKit.configure({
    table: {
      resizable: false,
      View: null,
      HTMLAttributes: { class: 'tiptap-note-table' },
    },
    tableCell: false,
    tableHeader: false,
  }),
  HollowgateTableCell.configure({ HTMLAttributes: { class: 'tiptap-note-table-cell' } }),
  HollowgateTableHeader.configure({ HTMLAttributes: { class: 'tiptap-note-table-header' } }),
  NoteTableCommands,
];
