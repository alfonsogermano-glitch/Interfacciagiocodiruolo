import { Node, mergeAttributes } from '@tiptap/core';
import { ReactNodeViewRenderer } from '@tiptap/react';
import { AllSelection, TextSelection } from '@tiptap/pm/state';
import { ArchivioView } from './ArchivioView';
import { canInsertNoteContainer } from './noteContainerPolicy';
import type { CustomDieRollSnapshot } from '../dice/diceTypes';

// Archivio: tabella veloce per oggetti, persone ed elementi di gioco.
// Blocco atomico (nessun contenuto ProseMirror dentro): l'intera griglia vive
// negli attributi come JSON e viene disegnata dalla NodeView React. La prima
// riga e' l'intestazione, la prima colonna (Nome) contiene solo testo. Un
// archivio nuovo nasce con quattro colonne (Nome/Tipo/Raggio d'azione/Danno)
// e con la riga di esempio Arco Lungo - vedi createArchivioStarterRow.

export const ARCHIVIO_CELL_MIN_WIDTH = 48;
export const ARCHIVIO_DEFAULT_COLUMN_WIDTH = 160;
export const ARCHIVIO_DEFAULT_TITLE = 'Archivio';

export type ArchivioCellKind = 'text' | 'dice' | 'checkbox' | 'points' | 'modifier';

export const ARCHIVIO_CELL_KINDS: readonly ArchivioCellKind[] = ['text', 'dice', 'checkbox', 'points', 'modifier'];

export const ARCHIVIO_CELL_LABEL: Record<ArchivioCellKind, string> = {
  text: 'Testo',
  dice: 'Dado',
  checkbox: 'Checkbox',
  points: 'Punti',
  modifier: 'Modificatore',
};

// Dado nella cella: a differenza dell'elemento Dado standard (titolo + valore,
// larghezza del nome) qui resta solo il valore, la cella si misura sulla
// colonna e puo' essere standard (formula) o custom (dado della libreria).
export type ArchivioDiceMode = 'standard' | 'custom';

export interface ArchivioCell {
  id: string;
  kind: ArchivioCellKind;
  text: string;
  checked: boolean;
  value: number;
  max: number;
  /** Modalita' del Dado: formula standard o dado Custom della libreria. */
  mode: ArchivioDiceMode;
  /** Quantita' di dadi Custom da tirare (come nell'elemento Dado standard). */
  quantity: number;
  /** Snapshot del dado Custom scelto: il tiro usa questo, non la libreria. */
  customDie: CustomDieRollSnapshot | null;
}

export interface ArchivioColumn {
  id: string;
  label: string;
  width: number;
}

export interface ArchivioRow {
  id: string;
  cells: ArchivioCell[];
}

function createArchivioId(): string {
  return globalThis.crypto?.randomUUID?.() ?? `archivio-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}

function finiteArchivioNumber(value: unknown, fallback: number): number {
  const parsed = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function isArchivioCellKind(value: unknown): value is ArchivioCellKind {
  return value === 'text' || value === 'dice' || value === 'checkbox' || value === 'points' || value === 'modifier';
}

export function defaultArchivioCell(kind: ArchivioCellKind = 'text'): ArchivioCell {
  const base: ArchivioCell = {
    id: createArchivioId(),
    kind,
    text: '',
    checked: false,
    value: 0,
    max: 0,
    mode: 'standard',
    quantity: 1,
    customDie: null,
  };
  if (kind === 'dice') return { ...base, text: '1d6' };
  if (kind === 'points') return { ...base, value: 10, max: 10 };
  if (kind === 'modifier') return { ...base, text: '0' };
  if (kind === 'text') return base;
  return { ...base, kind: 'text' };
}

export function defaultArchivioColumns(): ArchivioColumn[] {
  return [
    { id: createArchivioId(), label: 'Nome', width: ARCHIVIO_DEFAULT_COLUMN_WIDTH },
    { id: createArchivioId(), label: 'Tipo', width: ARCHIVIO_DEFAULT_COLUMN_WIDTH },
    { id: createArchivioId(), label: "Raggio d'azione", width: ARCHIVIO_DEFAULT_COLUMN_WIDTH },
    { id: createArchivioId(), label: 'Danno', width: ARCHIVIO_DEFAULT_COLUMN_WIDTH },
  ];
}

export function defaultArchivioRows(columns: ArchivioColumn[]): ArchivioRow[] {
  return [{ id: createArchivioId(), cells: columns.map(() => defaultArchivioCell('text')) }];
}

// Riga di esempio del nuovo archivio: la colonna Danno nasce gia' come Dado
// standard 1d6 (nessun titolo, larghezza della cella - vedi ArchivioView).
export function createArchivioStarterRow(columns: ArchivioColumn[]): ArchivioRow {
  const starterText: Record<string, string> = {
    'Nome': 'Arco Lungo',
    'Tipo': 'Distanza',
    "Raggio d'azione": '15/30/45',
  };
  return {
    id: createArchivioId(),
    cells: columns.map((column) => {
      if (column.label === 'Danno') return defaultArchivioCell('dice');
      const text = starterText[column.label];
      if (text === undefined) return defaultArchivioCell('text');
      return { ...defaultArchivioCell('text'), text };
    }),
  };
}

export function normalizeArchivioColumns(raw: unknown): ArchivioColumn[] {
  if (!Array.isArray(raw)) return defaultArchivioColumns();
  const cleaned = raw
    .filter((item): item is Record<string, unknown> => typeof item === 'object' && item !== null)
    .map((item) => ({
      id: typeof item.id === 'string' && item.id ? item.id : createArchivioId(),
      label: typeof item.label === 'string' && item.label.trim() ? String(item.label) : 'Nuova colonna',
      width: Math.max(ARCHIVIO_CELL_MIN_WIDTH, finiteArchivioNumber(item.width, ARCHIVIO_DEFAULT_COLUMN_WIDTH)),
    }));
  if (cleaned.length < 2) return defaultArchivioColumns();
  return cleaned;
}

function normalizeArchivioCell(raw: unknown, fallbackKind: ArchivioCellKind): ArchivioCell {
  const base = defaultArchivioCell(fallbackKind);
  if (typeof raw !== 'object' || raw === null) return base;
  const item = raw as Record<string, unknown>;
  const kind = isArchivioCellKind(item.kind) ? item.kind : fallbackKind;
  const value = finiteArchivioNumber(item.value, base.value);
  const max = finiteArchivioNumber(item.max, base.max);
  return {
    id: typeof item.id === 'string' && item.id ? item.id : createArchivioId(),
    kind,
    text: typeof item.text === 'string' ? String(item.text) : base.text,
    checked: item.checked === true,
    value: kind === 'points' && value > max ? max : value,
    max,
    mode: item.mode === 'custom' ? 'custom' : 'standard',
    quantity: Math.max(1, finiteArchivioNumber(item.quantity, base.quantity)),
    customDie:
      typeof item.customDie === 'object' && item.customDie !== null
        ? (item.customDie as CustomDieRollSnapshot)
        : null,
  };
}

export function normalizeArchivioRows(raw: unknown, columns: ArchivioColumn[]): ArchivioRow[] {
  if (!Array.isArray(raw)) return defaultArchivioRows(columns);
  return raw
    .filter((item): item is Record<string, unknown> => typeof item === 'object' && item !== null)
    .map((item) => {
      const cells = Array.isArray(item.cells) ? item.cells : [];
      return {
        id: typeof item.id === 'string' && item.id ? item.id : createArchivioId(),
        cells: columns.map((_, index) => {
          // La prima colonna contiene sempre e solo testo.
          const fallback: ArchivioCellKind = index === 0 ? 'text' : 'text';
          const cell = normalizeArchivioCell(cells[index], fallback);
          return index === 0 && cell.kind !== 'text' ? { ...cell, kind: 'text' as const } : cell;
        }),
      };
    });
}

export function archivioCellSortValue(cell: ArchivioCell): string | number {
  if (cell.kind === 'checkbox') return cell.checked ? 1 : 0;
  if (cell.kind === 'points') return cell.value;
  return (cell.text ?? '').toLocaleLowerCase();
}

export function sortArchivioRows(rows: ArchivioRow[], columnIndex: number, direction: 'asc' | 'desc'): ArchivioRow[] {
  const factor = direction === 'asc' ? 1 : -1;
  return [...rows].sort((a, b) => {
    const left = a.cells[columnIndex];
    const right = b.cells[columnIndex];
    if (!left || !right) return 0;
    const leftValue = archivioCellSortValue(left);
    const rightValue = archivioCellSortValue(right);
    if (typeof leftValue === 'number' && typeof rightValue === 'number') return (leftValue - rightValue) * factor;
    return String(leftValue).localeCompare(String(rightValue)) * factor;
  });
}

export function archivioCellDisplayText(cell: ArchivioCell): string {
  if (cell.kind === 'checkbox') return cell.checked ? 'Sì' : 'No';
  if (cell.kind === 'points') return `${cell.value}/${cell.max}`;
  if (cell.kind === 'dice' && cell.mode === 'custom' && cell.customDie) return `${cell.quantity} ${cell.customDie.name}`;
  return cell.text;
}

export function archivioToPlainText(title: string, titleVisible: boolean, columns: ArchivioColumn[], rows: ArchivioRow[]): string {
  const lines = [];
  if (titleVisible && title.trim()) lines.push(title.trim());
  lines.push(columns.map((column) => column.label).join('\t'));
  for (const row of rows) {
    lines.push(row.cells.map((cell) => archivioCellDisplayText(cell)).join('\t'));
  }
  return lines.join('\n');
}

function parseArchivioJSONAttribute(value: unknown): unknown {
  if (typeof value !== 'string' || !value) return null;
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

export const Archivio = Node.create({
  name: 'archivio',
  group: 'block',
  atom: true,
  // Come le tabelle ricche di informazioni: mai selezionabile come blocco,
  // si cancella solo con Elimina dal suo menu.
  selectable: false,
  defining: true,
  isolating: true,

  addAttributes() {
    return {
      archiveId: {
        default: null,
        parseHTML: (element) => element.getAttribute('data-archivio-id'),
        renderHTML: (attributes) => (attributes.archiveId ? { 'data-archivio-id': attributes.archiveId } : {}),
      },
      title: {
        default: ARCHIVIO_DEFAULT_TITLE,
        parseHTML: (element) => element.getAttribute('data-archivio-title') ?? ARCHIVIO_DEFAULT_TITLE,
        renderHTML: (attributes) => ({ 'data-archivio-title': attributes.title ?? ARCHIVIO_DEFAULT_TITLE }),
      },
      titleVisible: {
        default: true,
        parseHTML: (element) => element.getAttribute('data-archivio-title-visible') !== 'false',
        renderHTML: (attributes) => ({ 'data-archivio-title-visible': attributes.titleVisible === false ? 'false' : 'true' }),
      },
      columns: {
        default: [],
        parseHTML: (element) => {
          const parsed = parseArchivioJSONAttribute(element.getAttribute('data-archivio-columns'));
          return parsed ?? [];
        },
        renderHTML: (attributes) => ({ 'data-archivio-columns': JSON.stringify(attributes.columns ?? []) }),
      },
      rows: {
        default: [],
        parseHTML: (element) => {
          const parsed = parseArchivioJSONAttribute(element.getAttribute('data-archivio-rows'));
          return parsed ?? [];
        },
        renderHTML: (attributes) => ({ 'data-archivio-rows': JSON.stringify(attributes.rows ?? []) }),
      },
    };
  },

  parseHTML() {
    return [{ tag: 'div[data-type="archivio"]' }];
  },

  renderHTML({ HTMLAttributes }) {
    return ['div', mergeAttributes(HTMLAttributes, { 'data-type': 'archivio', class: 'tiptap-archivio' })];
  },

  addNodeView() {
    return ReactNodeViewRenderer(ArchivioView);
  },

  addCommands() {
    return {
      insertArchivio:
        () =>
        ({ commands, state, editor, tr, dispatch }) => {
          if (!editor.isEditable) return false;
          const decision = canInsertNoteContainer(state.selection.$from, 'archivio');
          if (!decision.allowed) return false;
          const columns = defaultArchivioColumns();
          const inserted = commands.insertContent({
            type: this.name,
            attrs: {
              archiveId: createArchivioId(),
              title: ARCHIVIO_DEFAULT_TITLE,
              titleVisible: true,
              columns,
              rows: [createArchivioStarterRow(columns)],
            },
          });
          if (!inserted || !dispatch) return inserted;
          // Su nota vuota (o quando l'unico paragrafo di testo resta consumato
          // dall'insert) il caso speciale di insertContentAt di Tiptap fa
          // from -= 1 / to += 1 e il replace copre l'intero documento: dopo
          // l'insert non esiste piu' alcun blocco di testo, TextSelection.near()
          // cade sul fallback AllSelection, ProseMirror seleziona tutto e
          // Chrome dipinge di blu tutti gli archivii della nota (il primo che
          // si crea su nota vuota, tutti i presenti al secondo). Aggiungiamo un
          // paragrafo di coda e ci piazziamo dentro.
          if (tr.selection instanceof AllSelection) {
            const end = tr.doc.content.size;
            const paragraph = state.schema.nodes.paragraph;
            if (paragraph) {
              tr.insert(end, paragraph.create());
              tr.setSelection(TextSelection.create(tr.doc, end + 1));
            }
          }
          return true;
        },
    };
  },
});

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    archivio: {
      /** Inserisce un blocco Archivio con le quattro colonne predefinite e la riga di esempio. */
      insertArchivio: () => ReturnType;
    };
  }
}
