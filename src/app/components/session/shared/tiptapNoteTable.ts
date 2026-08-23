import { Extension, type Extensions } from '@tiptap/core';
import { TableKit, TableCell, TableHeader } from '@tiptap/extension-table';
import type { Node as PMNode, ResolvedPos, Slice } from '@tiptap/pm/model';
import { Plugin, PluginKey, type EditorState } from '@tiptap/pm/state';

/**
 * Blocks allowed directly inside a Note table cell/header.
 *
 * `table` is deliberately absent: a table is a container boundary and may
 * never be nested in another table. TextBox/CollapseBlock are allowed here
 * as the one direct container level requested by the Notes editor; their
 * existing schemas/guards continue to prevent a second container level.
 */
export const NOTE_TABLE_CELL_CONTENT =
  '(paragraph | bulletList | orderedList | blockquote | horizontalRule | image | taskList | textBox | collapseBlock)+';

export const HollowgateTableCell = TableCell.extend({
  content: NOTE_TABLE_CELL_CONTENT,
});

export const HollowgateTableHeader = TableHeader.extend({
  content: NOTE_TABLE_CELL_CONTENT,
});

function isResolvedInside($pos: ResolvedPos, typeName: string): boolean {
  for (let depth = $pos.depth; depth >= 0; depth -= 1) {
    if ($pos.node(depth).type.name === typeName) return true;
  }
  return false;
}

function isSelectionInside(state: EditorState, typeName: string): boolean {
  return isResolvedInside(state.selection.$from, typeName);
}

export interface ActiveNoteTable {
  node: PMNode;
  pos: number;
  depth: number;
}

/** Resolve the table containing the current selection, if any. */
export function findActiveTable(state: EditorState): ActiveNoteTable | null {
  const { $from } = state.selection;
  for (let depth = $from.depth; depth >= 1; depth -= 1) {
    const node = $from.node(depth);
    if (node.type.name === 'table') {
      return {
        node,
        pos: $from.before(depth),
        depth,
      };
    }
  }
  return null;
}

/** True when an incoming ProseMirror Slice contains at least one table. */
export function sliceContainsTable(slice: Slice): boolean {
  let containsTable = false;
  slice.content.descendants((node) => {
    if (node.type.name === 'table') {
      containsTable = true;
      return false;
    }
    return !containsTable;
  });
  return containsTable;
}

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    noteTable: {
      /** Insert the fixed Hollowgate Note table: 3×3, no initial headers. */
      insertNoteTable: () => ReturnType;
    };
  }
}

export const NoteTableCommands = Extension.create({
  name: 'noteTableCommands',

  addCommands() {
    return {
      insertNoteTable:
        () =>
        ({ commands, state }) => {
          // Tables are only top-level Note content. In particular, do not let
          // an insertion command rely on ProseMirror finding another location
          // when the cursor is inside a restricted container.
          if (
            isSelectionInside(state, 'table') ||
            isSelectionInside(state, 'textBox') ||
            isSelectionInside(state, 'collapseBody') ||
            isSelectionInside(state, 'collapseSummary')
          ) {
            return false;
          }

          return commands.insertTable({ rows: 3, cols: 3, withHeaderRow: false });
        },
    };
  },

  addProseMirrorPlugins() {
    return [
      new Plugin({
        key: new PluginKey('noteTableNestingGuard'),
        props: {
          handlePaste: (view, _event, slice) => {
            if (!sliceContainsTable(slice)) return false;
            // Never create a table inside the currently active table. Consume
            // the paste without changing the document; ordinary non-table
            // paste remains untouched.
            return isSelectionInside(view.state, 'table');
          },
          handleDrop: (view, event, slice) => {
            if (!sliceContainsTable(slice)) return false;
            const target = view.posAtCoords({ left: event.clientX, top: event.clientY });
            if (!target) return false;
            return isResolvedInside(view.state.doc.resolve(target.pos), 'table');
          },
        },
      }),
    ];
  },
});

/**
 * TableKit supplies Table + TableRow and all native table commands/plugins.
 * The default cell/header nodes are disabled and replaced with the restricted
 * Hollowgate variants above so the schema itself enforces the nesting limit.
 */
export const NOTE_TABLE_EXTENSIONS: Extensions = [
  TableKit.configure({
    table: {
      resizable: false,
      HTMLAttributes: { class: 'tiptap-note-table' },
    },
    tableCell: false,
    tableHeader: false,
  }),
  HollowgateTableCell.configure({
    HTMLAttributes: { class: 'tiptap-note-table-cell' },
  }),
  HollowgateTableHeader.configure({
    HTMLAttributes: { class: 'tiptap-note-table-header' },
  }),
  NoteTableCommands,
];
