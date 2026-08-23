import { Extension, type Extensions } from '@tiptap/core';
import { TableKit, TableCell, TableHeader } from '@tiptap/extension-table';
import type { Node as PMNode, ResolvedPos, Slice } from '@tiptap/pm/model';
import { Plugin, PluginKey, type EditorState } from '@tiptap/pm/state';

export const NOTE_TABLE_CELL_CONTENT =
  '(paragraph | bulletList | orderedList | blockquote | horizontalRule | image | taskList | textBox | collapseBlock)+';

export const HollowgateTableCell = TableCell.extend({ content: NOTE_TABLE_CELL_CONTENT });
export const HollowgateTableHeader = TableHeader.extend({ content: NOTE_TABLE_CELL_CONTENT });

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

export function findActiveTable(state: EditorState): ActiveNoteTable | null {
  const { $from } = state.selection;
  for (let depth = $from.depth; depth >= 1; depth -= 1) {
    const node = $from.node(depth);
    if (node.type.name === 'table') return { node, pos: $from.before(depth), depth };
  }
  return null;
}

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
          if (
            isSelectionInside(state, 'table') ||
            isSelectionInside(state, 'textBox') ||
            isSelectionInside(state, 'collapseBody') ||
            isSelectionInside(state, 'collapseSummary')
          ) return false;
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

export const NOTE_TABLE_EXTENSIONS: Extensions = [
  TableKit.configure({
    table: { resizable: false, HTMLAttributes: { class: 'tiptap-note-table' } },
    tableCell: false,
    tableHeader: false,
  }),
  HollowgateTableCell.configure({ HTMLAttributes: { class: 'tiptap-note-table-cell' } }),
  HollowgateTableHeader.configure({ HTMLAttributes: { class: 'tiptap-note-table-header' } }),
  NoteTableCommands,
];
