import { Extension, type Extensions } from '@tiptap/core';
import { TableKit, TableCell, TableHeader } from '@tiptap/extension-table';
import type { Node as PMNode, ResolvedPos, Slice } from '@tiptap/pm/model';
import { Plugin, PluginKey, type EditorState } from '@tiptap/pm/state';
import { extractTablePayloadFromHtml } from './noteTableClipboard';

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

function isSelectionInsideTableRestrictedContainer(state: EditorState): boolean {
  return (
    isSelectionInside(state, 'table') ||
    isSelectionInside(state, 'textBox') ||
    isSelectionInside(state, 'collapseBody') ||
    isSelectionInside(state, 'collapseSummary')
  );
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
          handlePaste: (view, event, slice) => {
            const html = event.clipboardData?.getData('text/html') ?? '';
            const structuredTable = extractTablePayloadFromHtml(html);

            if (structuredTable) {
              // A copied Hollowgate table is portable across Note/editor/browser
              // tabs, but never allowed to become a nested table/container.
              if (isSelectionInsideTableRestrictedContainer(view.state)) return true;

              try {
                const tableNode = view.state.schema.nodeFromJSON(structuredTable);
                tableNode.check();
                if (tableNode.type.name !== 'table') return false;
                const transaction = view.state.tr.replaceSelectionWith(tableNode).scrollIntoView();
                view.dispatch(transaction);
                return true;
              } catch {
                // Invalid/stale structured metadata must not block the normal
                // HTML/plain-text paste fallback supplied by the clipboard.
                return false;
              }
            }

            if (!sliceContainsTable(slice)) return false;
            // Conventional HTML table pastes obey the same nesting boundary.
            return isSelectionInsideTableRestrictedContainer(view.state);
          },
          handleDrop: (view, event, slice) => {
            if (!sliceContainsTable(slice)) return false;
            const target = view.posAtCoords({ left: event.clientX, top: event.clientY });
            if (!target) return false;
            const $target = view.state.doc.resolve(target.pos);
            return (
              isResolvedInside($target, 'table') ||
              isResolvedInside($target, 'textBox') ||
              isResolvedInside($target, 'collapseBody') ||
              isResolvedInside($target, 'collapseSummary')
            );
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
