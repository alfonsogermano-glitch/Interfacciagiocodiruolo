import { Extension, type Extensions } from '@tiptap/core';
import { TableKit, TableCell, TableHeader, TableView } from '@tiptap/extension-table';
import { GapCursor } from '@tiptap/pm/gapcursor';
import type { Node as PMNode } from '@tiptap/pm/model';
import { Plugin, type EditorState } from '@tiptap/pm/state';
import { TableMap, columnResizingPluginKey } from '@tiptap/pm/tables';
import type { EditorView } from '@tiptap/pm/view';
import { canInsertNoteContainer } from './noteContainerPolicy';
import { getNoteTableContainerGapTarget } from './noteTableContainerGapCursor';
import './noteTableResize.css';

export const NOTE_TABLE_CELL_CONTENT =
  '(paragraph | bulletList | orderedList | blockquote | horizontalRule | image | taskList | textBox | collapseBlock)+';

const NOTE_TABLE_CELL_MIN_WIDTH = 48;

export const HollowgateTableCell = TableCell.extend({ content: NOTE_TABLE_CELL_CONTENT });
export const HollowgateTableHeader = TableHeader.extend({ content: NOTE_TABLE_CELL_CONTENT });

export interface ActiveNoteTable {
  node: PMNode;
  pos: number;
  depth: number;
}

function setGridVisibilityAttribute(table: HTMLTableElement, node: PMNode) {
  table.setAttribute('data-grid-visible', node.attrs.gridVisible !== false ? 'true' : 'false');
}

class HollowgateTableView extends TableView {
  constructor(node: PMNode, cellMinWidth: number, view?: EditorView) {
    super(node, cellMinWidth, view, { class: 'tiptap-note-table' });
    setGridVisibilityAttribute(this.table, node);
  }

  update(node: PMNode): boolean {
    const updated = super.update(node);
    if (updated) setGridVisibilityAttribute(this.table, node);
    return updated;
  }
}

function tableHasFixedColumnWidths(table: PMNode): boolean {
  const firstRow = table.firstChild;
  if (!firstRow) return true;

  for (let index = 0; index < firstRow.childCount; index += 1) {
    const cell = firstRow.child(index);
    const colspan = Number(cell.attrs.colspan) || 1;
    const colwidth = cell.attrs.colwidth as number[] | null;
    if (!colwidth || colwidth.length < colspan) return false;
    for (let spanIndex = 0; spanIndex < colspan; spanIndex += 1) {
      if (!(colwidth[spanIndex] > 0)) return false;
    }
  }

  return true;
}

function findRenderedTable(view: EditorView, tableStart: number): HTMLTableElement | null {
  let dom: Node | null = view.domAtPos(tableStart).node;
  while (dom && (!(dom instanceof HTMLElement) || dom.tagName !== 'TABLE')) dom = dom.parentNode;
  return dom instanceof HTMLTableElement ? dom : null;
}

function readRenderedColumnWidths(table: HTMLTableElement, columnCount: number): number[] | null {
  const firstRow = table.rows.item(0);
  if (!firstRow || columnCount <= 0) return null;

  const widths: number[] = [];
  for (const cell of Array.from(firstRow.cells)) {
    const colspan = Math.max(1, cell.colSpan || 1);
    const renderedWidth = cell.getBoundingClientRect().width;
    if (!(renderedWidth > 0)) return null;
    const perColumn = renderedWidth / colspan;
    for (let index = 0; index < colspan; index += 1) widths.push(perColumn);
  }

  if (widths.length !== columnCount) return null;
  return widths.map((width) => Math.max(NOTE_TABLE_CELL_MIN_WIDTH, Math.round(width)));
}

function sameWidths(current: number[] | null, next: number[]): boolean {
  return Boolean(current && current.length === next.length && current.every((width, index) => width === next[index]));
}

function bootstrapRenderedColumnWidths(view: EditorView, activeHandle: number) {
  const $cell = view.state.doc.resolve(activeHandle);
  const table = $cell.node(-1);
  if (table.type.spec.tableRole !== 'table' || tableHasFixedColumnWidths(table)) return;

  const tableStart = $cell.start(-1);
  const map = TableMap.get(table);
  const renderedTable = findRenderedTable(view, tableStart);
  if (!renderedTable) return;

  const widths = readRenderedColumnWidths(renderedTable, map.width);
  if (!widths) return;

  const visited = new Set<number>();
  let tr = view.state.tr;
  for (let row = 0; row < map.height; row += 1) {
    for (let col = 0; col < map.width; col += 1) {
      const relativePos = map.map[row * map.width + col];
      if (visited.has(relativePos)) continue;
      visited.add(relativePos);

      const cell = table.nodeAt(relativePos);
      if (!cell) continue;
      const left = map.colCount(relativePos);
      const colspan = Number(cell.attrs.colspan) || 1;
      const colwidth = widths.slice(left, left + colspan);
      if (colwidth.length !== colspan || sameWidths(cell.attrs.colwidth as number[] | null, colwidth)) continue;

      tr = tr.setNodeMarkup(tableStart + relativePos, undefined, {
        ...cell.attrs,
        colwidth,
      });
    }
  }

  if (tr.docChanged) view.dispatch(tr);
}

const NoteTableResizeBootstrap = Extension.create({
  name: 'noteTableResizeBootstrap',
  priority: 1000,

  addProseMirrorPlugins() {
    return [
      new Plugin({
        props: {
          handleDOMEvents: {
            mousedown: (view, event) => {
              if (event.button !== 0) return false;
              const resizeState = columnResizingPluginKey.getState(view.state) as
                | { activeHandle: number; dragging: unknown }
                | undefined;
              if (!resizeState || resizeState.activeHandle < 0 || resizeState.dragging) return false;
              bootstrapRenderedColumnWidths(view, resizeState.activeHandle);
              return false;
            },
          },
        },
      }),
    ];
  },
});

interface DirectTableContainer {
  node: PMNode;
  pos: number;
  parentRole: unknown;
  childIndex: number;
  childCount: number;
}

function directTableContainerFromDOM(view: EditorView, element: HTMLElement): DirectTableContainer | null {
  const domPos = view.posAtDOM(element, 0);
  const $pos = view.state.doc.resolve(domPos);
  const directNode = $pos.nodeAfter;

  if (directNode && (directNode.type.name === 'textBox' || directNode.type.name === 'collapseBlock')) {
    const parentRole = $pos.parent.type.spec.tableRole;
    if (parentRole === 'cell' || parentRole === 'header_cell') {
      return {
        node: directNode,
        pos: domPos,
        parentRole,
        childIndex: $pos.index(),
        childCount: $pos.parent.childCount,
      };
    }
  }

  for (let depth = $pos.depth; depth >= 1; depth -= 1) {
    const node = $pos.node(depth);
    if (node.type.name !== 'textBox' && node.type.name !== 'collapseBlock') continue;
    const parent = $pos.node(depth - 1);
    const parentRole = parent.type.spec.tableRole;
    if (parentRole !== 'cell' && parentRole !== 'header_cell') return null;
    return {
      node,
      pos: $pos.before(depth),
      parentRole,
      childIndex: $pos.index(depth - 1),
      childCount: parent.childCount,
    };
  }

  return null;
}

function setTableContainerGapCursor(view: EditorView, event: MouseEvent): boolean {
  if (!view.editable || event.button !== 0) return false;
  const target = event.target;
  if (!(target instanceof Element)) return false;
  const element = target.closest('.tiptap-textbox, .tiptap-collapse') as HTMLElement | null;
  if (!element) return false;

  const container = directTableContainerFromDOM(view, element);
  if (!container) return false;
  const rect = element.getBoundingClientRect();
  const side = getNoteTableContainerGapTarget({
    containerType: container.node.type.name,
    parentRole: container.parentRole,
    childIndex: container.childIndex,
    childCount: container.childCount,
    clientY: event.clientY,
    top: rect.top,
    bottom: rect.bottom,
  });
  if (!side) return false;

  const gapPos = side === 'before' ? container.pos : container.pos + container.node.nodeSize;
  const $gap = view.state.doc.resolve(gapPos);
  if (!GapCursor.valid($gap)) return false;

  event.preventDefault();
  event.stopPropagation();
  view.dispatch(
    view.state.tr
      .setSelection(new GapCursor($gap))
      .setMeta('pointer', true)
      .scrollIntoView(),
  );
  return true;
}

const NoteTableContainerGapCursor = Extension.create({
  name: 'noteTableContainerGapCursor',
  priority: 1100,

  addProseMirrorPlugins() {
    return [
      new Plugin({
        view: (view) => {
          const onMouseDown = (event: MouseEvent) => {
            setTableContainerGapCursor(view, event);
          };
          view.dom.addEventListener('mousedown', onMouseDown, true);
          return {
            destroy() {
              view.dom.removeEventListener('mousedown', onMouseDown, true);
            },
          };
        },
      }),
    ];
  },
});

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
  NoteTableContainerGapCursor,
  NoteTableResizeBootstrap,
  TableKit.configure({
    table: {
      resizable: true,
      cellMinWidth: NOTE_TABLE_CELL_MIN_WIDTH,
      View: HollowgateTableView,
      HTMLAttributes: { class: 'tiptap-note-table' },
    },
    tableCell: false,
    tableHeader: false,
  }),
  HollowgateTableCell.configure({ HTMLAttributes: { class: 'tiptap-note-table-cell' } }),
  HollowgateTableHeader.configure({ HTMLAttributes: { class: 'tiptap-note-table-header' } }),
  NoteTableCommands,
];
