import { useEffect, useLayoutEffect, useRef, useState, type KeyboardEvent as ReactKeyboardEvent, type MouseEvent as ReactMouseEvent, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { NodeViewWrapper, type NodeViewProps } from '@tiptap/react';
import { usePortalContainer } from '../../ui/portal-container';
import { placeFloatingNoteUI } from './noteFloatingPosition';
import {
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  Clipboard,
  Cog,
  Copy,
  Dices,
  Eye,
  EyeOff,
  Gauge,
  Library,
  MoreVertical,
  Pencil,
  Plus,
  SquareCheckBig,
  Trash2,
  Type,
} from 'lucide-react';
import {
  ARCHIVIO_CELL_MIN_WIDTH,
  ARCHIVIO_DEFAULT_COLUMN_WIDTH,
  archivioCellSortValue,
  archivioToPlainText,
  defaultArchivioCell,
  normalizeArchivioColumns,
  normalizeArchivioRows,
  sortArchivioRows,
  type ArchivioCell,
  type ArchivioCellKind,
  type ArchivioColumn,
  type ArchivioRow,
} from './tiptapArchivio';
import { useAuth } from '../../../auth/AuthContext';
import { useCampaign } from '../../../campaigns/CampaignContext';
import { loadCustomDice } from '../../../../services/supabase/diceCustomDiceService';
import { CustomDieLibraryIcon } from '../dice/CustomDieLibraryIcon';
import { toCustomDieRollSnapshot } from '../dice/diceCustomDie';
import { useOptionalDiceSession } from '../dice/DiceSessionContext';
import type { SavedCustomDie } from '../dice/diceTypes';
import { getModifierLookup } from './tiptapInlineModifier';

type MenuState =
  | { scope: 'block' }
  | { scope: 'column'; col: number }
  | { scope: 'row'; row: number }
  | { scope: 'cell'; row: number; col: number }
  | { scope: 'dice'; row: number; col: number }
  | null;

function createViewId(): string {
  return globalThis.crypto?.randomUUID?.() ?? `archivio-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}

function MenuItem({
  icon: Icon,
  label,
  disabled = false,
  danger = false,
  onSelect,
}: {
  icon: typeof Pencil;
  label: string;
  disabled?: boolean;
  danger?: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      contentEditable={false}
      disabled={disabled}
      aria-label={label}
      onMouseDown={(event) => {
        event.preventDefault();
        event.stopPropagation();
      }}
      onClick={(event) => {
        event.stopPropagation();
        if (!disabled) onSelect();
      }}
      className={`flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-left text-xs transition-colors duration-[var(--note-ui-duration)] ${
        disabled
          ? 'cursor-not-allowed opacity-40'
          : danger
            ? 'text-[var(--dash-danger-text)] hover:bg-[var(--dash-danger-bg)]'
            : 'text-[var(--dash-text)] hover:bg-[var(--dash-accent)] hover:text-[var(--dash-text-strong)]'
      }`}
    >
      <Icon className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
      <span className="truncate">{label}</span>
    </button>
  );
}

function TriggerButton({
  label,
  onOpen,
  children,
  className = '',
}: {
  label: string;
  onOpen: (event: ReactMouseEvent<HTMLButtonElement>) => void;
  children: ReactNode;
  className?: string;
}) {
  return (
    <button
      type="button"
      contentEditable={false}
      aria-label={label}
      data-archivio-trigger="true"
      onMouseDown={(event) => {
        event.preventDefault();
        event.stopPropagation();
      }}
      onClick={(event) => {
        event.stopPropagation();
        onOpen(event);
      }}
      className={`inline-flex shrink-0 items-center justify-center rounded-md p-1 text-[var(--dash-muted)] transition-colors duration-[var(--note-ui-duration)] hover:bg-[var(--dash-surface-2)] hover:text-[var(--dash-text)] ${className}`}
    >
      {children}
    </button>
  );
}

// Puntini delle celle e delle intestazioni: overlay assoluto che non occupa
// spazio, visibile solo in hover/focus come i menu di Punti e Modificatori.
// Il gruppo ha il nome "cell" perche' il contenitore generico dell'editor e'
// gia' un "group" senza nome: le varianti senza nome risponderebbero a quel
// gruppo e tutti i puntini della nota resterebbero visibili con il focus.
const HOVER_DOTS =
  'absolute right-0 top-1/2 -translate-y-1/2 opacity-0 transition-opacity duration-[var(--note-ui-duration)] pointer-events-none group-hover/cell:pointer-events-auto group-hover/cell:opacity-100 group-focus-within/cell:pointer-events-auto group-focus-within/cell:opacity-100 focus-visible:opacity-100';

// Dentro la tabella i menu sarebbero ritagliati dallo scroll orizzontale.
// Il portal tematizzato mantiene disponibili le variabili --dash-*.
function MenuPortal({ anchor, children }: { anchor: { x: number; y: number } | null; children: ReactNode }) {
  const portalContainer = usePortalContainer();
  const menuRef = useRef<HTMLDivElement | null>(null);
  // Prima del misuraggio il menù resta sotto l'ancora: useLayoutEffect lo
  // riposiziona prima del paint, quindi non si vede alcuno scatto.
  const initial = anchor ? { top: anchor.y, left: anchor.x } : null;
  useLayoutEffect(() => {
    const el = menuRef.current;
    if (!anchor || !el) return;
    const place = () => {
      const placed = placeFloatingNoteUI(
        { left: anchor.x, right: anchor.x + 2, top: anchor.y, bottom: anchor.y },
        el.offsetWidth,
        el.offsetHeight,
        6,
      );
      el.style.top = `${placed.top}px`;
      el.style.left = `${placed.left}px`;
    };
    place();
    // Le voci (per esempio i dadi custom caricati in async) possono cambiare
    // l'altezza: finché il contenuto si ridimensiona si rimisura.
    const observer = new ResizeObserver(place);
    observer.observe(el);
    window.addEventListener('resize', place);
    return () => {
      observer.disconnect();
      window.removeEventListener('resize', place);
    };
  }, [anchor, children]);
  if (!anchor || !initial || typeof document === 'undefined') return null;
  return createPortal(
    <div
      ref={menuRef}
      data-note-contextual-ui="true"
      data-archivio-menu="true"
      contentEditable={false}
      style={{
        position: 'fixed',
        top: initial.top,
        left: initial.left,
        zIndex: 9997,
        background: 'var(--dash-panel)',
        backgroundColor: 'var(--dash-panel)',
      }}
      className="max-h-[min(60vh,380px)] w-56 overflow-y-auto rounded-lg border border-[var(--dash-border-soft)] bg-[var(--dash-panel)] p-1 shadow-lg"
    >
      {children}
    </div>,
    portalContainer ?? document.body,
  );
}

export function ArchivioView({ node, editor, getPos, updateAttributes }: NodeViewProps) {
  const columns = normalizeArchivioColumns(node.attrs.columns as unknown);
  const rows = normalizeArchivioRows(node.attrs.rows as unknown, columns);
  const title = typeof node.attrs.title === 'string' ? (node.attrs.title as string) : 'Archivio';
  const titleVisible = (node.attrs.titleVisible as boolean) !== false;

  const [menu, setMenu] = useState<MenuState>(null);
  const [anchor, setAnchor] = useState<{ x: number; y: number } | null>(null);
  const [renamingColumn, setRenamingColumn] = useState<string | null>(null);
  // Le celle Dado mostrano il pulsante di tiro; l'input della formula riappare
  // solo quando si sceglie "Modifica" dal menu della cella.
  const [editingCellId, setEditingCellId] = useState<string | null>(null);
  const [customDice, setCustomDice] = useState<SavedCustomDie[]>([]);
  const [customDiceLoading, setCustomDiceLoading] = useState(false);
  const customDiceLoadSequenceRef = useRef(0);
  const { user } = useAuth();
  const { activeCampaign } = useCampaign();
  const diceSession = useOptionalDiceSession();
  const resizeRef = useRef<{ col: number; startX: number; startWidth: number } | null>(null);

  const openMenu = (next: MenuState, event: ReactMouseEvent<HTMLButtonElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    setAnchor({ x: rect.left, y: rect.bottom });
    setMenu(next);
  };

  const closeMenu = () => {
    setMenu(null);
    setAnchor(null);
  };

  useEffect(() => {
    if (!menu) return;
    const outside = (event: PointerEvent) => {
      const target = event.target as Element | null;
      if (target?.closest('[data-archivio-menu="true"]') || target?.closest('[data-archivio-trigger="true"]')) return;
      closeMenu();
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') closeMenu();
    };
    document.addEventListener('pointerdown', outside, true);
    window.addEventListener('keydown', escape);
    return () => {
      document.removeEventListener('pointerdown', outside, true);
      window.removeEventListener('keydown', escape);
    };
  }, [menu]);

  const set = (patch: { title?: string; titleVisible?: boolean; columns?: ArchivioColumn[]; rows?: ArchivioRow[] }) => {
    updateAttributes(patch);
    closeMenu();
  };

  const stopKeys = (event: ReactKeyboardEvent) => {
    event.stopPropagation();
  };

  // Nuova riga che copia gli elementi (kinds) della riga di riferimento, ma non il valore.
  const addRow = (referenceIndex: number | null, insertAt: number) => {
    const reference = referenceIndex !== null ? rows[referenceIndex] : rows[rows.length - 1];
    const cells = columns.map((_, index) => {
      if (index === 0) return defaultArchivioCell('text');
      return defaultArchivioCell(reference?.cells[index]?.kind ?? 'text');
    });
    const next = [...rows];
    next.splice(Math.max(0, Math.min(insertAt, next.length)), 0, { id: createViewId(), cells });
    set({ rows: next });
  };

  const addColumnAt = (index: number) => {
    const clamped = Math.max(1, Math.min(index, columns.length));
    const column: ArchivioColumn = { id: createViewId(), label: 'Nuova colonna', width: ARCHIVIO_DEFAULT_COLUMN_WIDTH };
    const nextColumns = [...columns];
    nextColumns.splice(clamped, 0, column);
    const nextRows = rows.map((row) => {
      const cells = [...row.cells];
      cells.splice(clamped, 0, defaultArchivioCell('text'));
      return { ...row, cells };
    });
    set({ columns: nextColumns, rows: nextRows });
  };

  const deleteColumnAt = (index: number) => {
    if (index <= 0 || columns.length <= 2) return;
    set({
      columns: columns.filter((_, i) => i !== index),
      rows: rows.map((row) => ({ ...row, cells: row.cells.filter((_, i) => i !== index) })),
    });
  };

  const moveColumn = (index: number, delta: -1 | 1) => {
    const target = index + delta;
    if (index <= 0 || target <= 0 || target >= columns.length) return;
    const nextColumns = [...columns];
    const [moved] = nextColumns.splice(index, 1);
    nextColumns.splice(target, 0, moved);
    const nextRows = rows.map((row) => {
      const cells = [...row.cells];
      const [movedCell] = cells.splice(index, 1);
      cells.splice(target, 0, movedCell);
      return { ...row, cells };
    });
    set({ columns: nextColumns, rows: nextRows });
  };

  const convertColumn = (index: number, kind: ArchivioCellKind) => {
    if (index <= 0) return;
    set({
      rows: rows.map((row) => ({
        ...row,
        cells: row.cells.map((cell, i) => (i === index ? defaultArchivioCell(kind) : cell)),
      })),
    });
  };

  const sortByColumn = (index: number, direction: 'asc' | 'desc') => {
    set({ rows: sortArchivioRows(rows, index, direction) });
  };

  const deleteRowAt = (index: number) => {
    set({ rows: rows.filter((_, i) => i !== index) });
  };

  const moveRow = (index: number, delta: -1 | 1) => {
    const target = index + delta;
    if (target < 0 || target >= rows.length) return;
    const next = [...rows];
    const [moved] = next.splice(index, 1);
    next.splice(target, 0, moved);
    set({ rows: next });
  };

  const transformCell = (rowIndex: number, colIndex: number, kind: ArchivioCellKind) => {
    set({
      rows: rows.map((row, r) =>
        r !== rowIndex
          ? row
          : { ...row, cells: row.cells.map((cell, c) => (c === colIndex ? defaultArchivioCell(kind) : cell)) },
      ),
    });
  };

  const updateCell = (rowIndex: number, colIndex: number, patch: Partial<ArchivioCell>) => {
    const next = rows.map((row, r) =>
      r !== rowIndex
        ? row
        : {
            ...row,
            cells: row.cells.map((cell, c) => {
              if (c !== colIndex) return cell;
              const merged = { ...cell, ...patch };
              if (merged.kind === 'points' && merged.value > merged.max) merged.value = merged.max;
              return merged;
            }),
          },
    );
    updateAttributes({ rows: next });
  };

  // Libreria dadi Custom della campagna, caricata all'apertura del selettore.
  const loadDiceLibrary = async () => {
    const sequence = ++customDiceLoadSequenceRef.current;
    if (!user?.id || !activeCampaign?.id) {
      setCustomDice([]);
      setCustomDiceLoading(false);
      return;
    }
    setCustomDiceLoading(true);
    try {
      const loaded = await loadCustomDice(activeCampaign.id, user.id);
      if (sequence !== customDiceLoadSequenceRef.current) return;
      setCustomDice(loaded);
    } catch (error) {
      console.error("Errore caricamento dadi Custom per l'Archivio:", error);
      if (sequence === customDiceLoadSequenceRef.current) setCustomDice([]);
    } finally {
      if (sequence === customDiceLoadSequenceRef.current) setCustomDiceLoading(false);
    }
  };

  // Nome del tiro in chat: "<Nome riga> - <colonna>" (es. "Arco Lungo — Danno").
  const diceRollName = (rowIndex: number, colIndex: number) => {
    const rowName = (rows[rowIndex]?.cells[0]?.text ?? '').trim();
    const label = columnLabel(columns[colIndex]);
    return rowName ? `${rowName} — ${label}` : label;
  };

  const rollCellDice = (rowIndex: number, colIndex: number) => {
    const cell = rows[rowIndex]?.cells[colIndex];
    if (!cell || cell.kind !== 'dice' || !diceSession) return;
    const name = diceRollName(rowIndex, colIndex);
    try {
      if (cell.mode === 'custom') {
        if (!cell.customDie) return;
        diceSession.submitInlineCustomDieRoll({ name, quantity: cell.quantity, customDie: cell.customDie });
        return;
      }
      const formula = cell.text.trim();
      if (!formula) return;
      // I tag "[Nome]" si risolvono sui valori correnti della nota, come
      // nell'elemento Dado standard (stesso lookup, stesso evento di tiro).
      const lookup = getModifierLookup(editor.view);
      const resolveName = (refName: string) => {
        const entry = lookup.get(refName);
        return entry ? { value: entry.value, formula: entry.formula } : null;
      };
      diceSession.submitModifierRoll({ name, expression: formula, formula, resolveName });
    } catch (error) {
      console.error('Errore tiro Dado Archivio:', error);
    }
  };

  const focusCellEditor = (cellId: string) => {
    closeMenu();
    // Nelle celle Dado l'input e' nascosto dietro il pulsante di tiro: lo
    // montiamo prima, poi il rAF lo mette a fuoco.
    setEditingCellId(cellId);
    window.requestAnimationFrame(() => {
      document.querySelector<HTMLElement>(`[data-archivio-cell-input="${cellId}"]`)?.focus();
    });
  };

  const duplicateArchive = () => {
    closeMenu();
    const pos = getPos();
    if (typeof pos !== 'number') return;
    const freshColumns = columns.map((column) => ({ ...column, id: createViewId() }));
    const freshRows = rows.map((row) => ({
      id: createViewId(),
      cells: row.cells.map((cell) => ({ ...cell, id: createViewId() })),
    }));
    const type = editor.view.state.schema.nodes.archivio;
    if (!type) return;
    const created = type.create({
      archiveId: createViewId(),
      title,
      titleVisible,
      columns: freshColumns,
      rows: freshRows,
    });
    editor.view.dispatch(editor.view.state.tr.insert(pos + node.nodeSize, created));
  };

  const copyArchive = async () => {
    const text = archivioToPlainText(title, titleVisible, columns, rows);
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      const textarea = document.createElement('textarea');
      textarea.value = text;
      textarea.style.cssText = 'position:fixed;opacity:0';
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand('copy');
      textarea.remove();
    }
    closeMenu();
  };

  const deleteArchive = () => {
    const pos = getPos();
    if (typeof pos !== 'number') return;
    editor.view.dispatch(editor.view.state.tr.delete(pos, pos + node.nodeSize));
  };

  const startResize = (event: ReactMouseEvent, colIndex: number) => {
    event.preventDefault();
    event.stopPropagation();
    const startWidth = columns[colIndex]?.width ?? ARCHIVIO_DEFAULT_COLUMN_WIDTH;
    resizeRef.current = { col: colIndex, startX: event.clientX, startWidth };
    const base = columns.map((column) => ({ ...column }));
    const onMove = (ev: MouseEvent) => {
      const current = resizeRef.current;
      if (!current) return;
      const next = Math.max(ARCHIVIO_CELL_MIN_WIDTH, Math.round(current.startWidth + (ev.clientX - current.startX)));
      updateAttributes({ columns: base.map((column, i) => (i === current.col ? { ...column, width: next } : column)) });
    };
    const onUp = () => {
      resizeRef.current = null;
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  };

  const renderCellEditor = (cell: ArchivioCell, rowIndex: number, colIndex: number) => {
    if (cell.kind === 'checkbox') {
      return (
        <input
          type="checkbox"
          data-archivio-cell-input={cell.id}
          checked={cell.checked}
          onChange={(event) => updateCell(rowIndex, colIndex, { checked: event.target.checked })}
          onMouseDown={(event) => event.stopPropagation()}
          onKeyDown={stopKeys}
          aria-label="Checkbox"
          className="h-4 w-4 shrink-0 accent-[var(--dash-accent)]"
        />
      );
    }
    if (cell.kind === 'points') {
      return (
        <span className="flex min-w-0 flex-1 items-center justify-center gap-1">
          <input
            type="number"
            data-archivio-cell-input={cell.id}
            value={cell.value}
            onChange={(event) => {
              const parsed = Number(event.target.value);
              if (Number.isFinite(parsed)) updateCell(rowIndex, colIndex, { value: parsed });
            }}
            onMouseDown={(event) => event.stopPropagation()}
            onKeyDown={stopKeys}
            aria-label="Valore punti"
            className="w-12 min-w-0 rounded border border-[var(--dash-border-soft)] bg-[var(--dash-surface)] px-1 py-0.5 text-center text-xs text-[var(--dash-text)] outline-none focus:border-[var(--dash-accent)]"
          />
          <span className="text-[var(--dash-muted)]">/</span>
          <input
            type="number"
            value={cell.max}
            onChange={(event) => {
              const parsed = Number(event.target.value);
              if (Number.isFinite(parsed)) updateCell(rowIndex, colIndex, { max: parsed });
            }}
            onMouseDown={(event) => event.stopPropagation()}
            onKeyDown={stopKeys}
            aria-label="Massimo punti"
            className="w-12 min-w-0 rounded border border-[var(--dash-border-soft)] bg-[var(--dash-surface)] px-1 py-0.5 text-center text-xs text-[var(--dash-text)] outline-none focus:border-[var(--dash-accent)]"
          />
        </span>
      );
    }
    if (cell.kind === 'dice') {
      // "Modifica" riapre la formula; di default la cella e' un pulsante di
      // tiro a tutta larghezza, senza titolo: solo il valore (o la faccia del
      // dado Custom con la quantita').
      if (editingCellId === cell.id) {
        return (
          <input
            data-archivio-cell-input={cell.id}
            value={cell.text}
            onChange={(event) => updateCell(rowIndex, colIndex, { text: event.target.value })}
            onBlur={() => setEditingCellId((current) => (current === cell.id ? null : current))}
            onMouseDown={(event) => event.stopPropagation()}
            onKeyDown={stopKeys}
            aria-label="Dado"
            placeholder="1d6"
            className="min-w-0 flex-1 rounded-md border border-[var(--dash-border-soft)] bg-[var(--dash-surface-2)] px-2 py-1 font-mono text-xs font-semibold text-[var(--dash-text)] outline-none focus:border-[var(--dash-accent)]"
          />
        );
      }
      const rollLabel = `Tira ${diceRollName(rowIndex, colIndex)}`;
      return (
        <button
          type="button"
          contentEditable={false}
          data-archivio-dice="true"
          onMouseDown={(event) => {
            event.preventDefault();
            event.stopPropagation();
          }}
          onClick={(event) => {
            event.stopPropagation();
            rollCellDice(rowIndex, colIndex);
          }}
          aria-label={rollLabel}
          title={rollLabel}
          className="flex h-8 w-full min-w-0 items-center justify-center gap-1.5 rounded-md border border-[var(--dash-border-soft)] bg-[var(--dash-surface-2)] px-2 font-mono text-xs font-semibold text-[var(--dash-text)] transition-colors duration-[var(--note-ui-duration)] hover:border-[var(--dash-accent)] hover:bg-[var(--dash-surface)] hover:text-[var(--dash-text-strong)] overflow-hidden"
        >
          {cell.mode === 'custom' && cell.customDie ? (
            <>
              <span className="text-sm font-bold leading-none">{cell.quantity}</span>
              <CustomDieLibraryIcon die={cell.customDie} size="compact" faceOffsetY={3} />
            </>
          ) : (
            <>
              <Dices className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
              <span className="min-w-0 truncate">{cell.text || '1d6'}</span>
            </>
          )}
        </button>
      );
    }
    if (cell.kind === 'modifier') {
      return (
        <input
          data-archivio-cell-input={cell.id}
          value={cell.text}
          onChange={(event) => updateCell(rowIndex, colIndex, { text: event.target.value })}
          onMouseDown={(event) => event.stopPropagation()}
          onKeyDown={stopKeys}
          aria-label="Modificatore"
          placeholder="0"
          className="min-w-0 flex-1 rounded-md border border-[var(--dash-border-soft)] bg-[var(--dash-surface)] px-2 py-1 font-mono text-xs text-[var(--dash-text)] outline-none focus:border-[var(--dash-accent)]"
        />
      );
    }
    return (
      <input
        data-archivio-cell-input={cell.id}
        value={cell.text}
        onChange={(event) => updateCell(rowIndex, colIndex, { text: event.target.value })}
        onMouseDown={(event) => event.stopPropagation()}
        onKeyDown={stopKeys}
        aria-label={colIndex === 0 ? 'Nome' : 'Testo'}
        placeholder={colIndex === 0 ? 'Nome' : ''}
        className="min-w-0 flex-1 bg-transparent px-0.5 py-1 text-xs text-[var(--dash-text)] outline-none placeholder:text-[var(--dash-muted)]"
      />
    );
  };

  const transformItems = (cell: ArchivioCell, rowIndex: number, colIndex: number) => {
    const options: Array<{ kind: ArchivioCellKind; label: string; icon: typeof Type }> = [
      { kind: 'text', label: 'Trasforma in testo', icon: Type },
      { kind: 'dice', label: 'Trasforma in Dado', icon: Dices },
      { kind: 'checkbox', label: 'Trasforma in checkbox', icon: SquareCheckBig },
      { kind: 'points', label: 'Trasforma in Punti', icon: Gauge },
      { kind: 'modifier', label: 'Trasforma in modificatore', icon: Cog },
    ];
    return (
      <>
        {cell.kind !== 'text' && (
          <MenuItem icon={Pencil} label="Modifica" onSelect={() => focusCellEditor(cell.id)} />
        )}
        {cell.kind === 'dice' && (
          <>
            <MenuItem
              icon={Dices}
              label="Dado standard"
              disabled={cell.mode !== 'custom'}
              onSelect={() => {
                updateCell(rowIndex, colIndex, { mode: 'standard' });
                closeMenu();
              }}
            />
            <MenuItem
              icon={Library}
              label="Scegli Dado custom…"
              onSelect={() => {
                void loadDiceLibrary();
                setMenu({ scope: 'dice', row: rowIndex, col: colIndex });
              }}
            />
          </>
        )}
        {options
          .filter((option) => option.kind !== cell.kind)
          .map((option) => (
            <MenuItem
              key={option.kind}
              icon={option.icon}
              label={option.label}
              onSelect={() => transformCell(rowIndex, colIndex, option.kind)}
            />
          ))}
      </>
    );
  };

  // Sottolista: dadi della libreria della campagna per la cella Dado.
  const dicePickerItems = (rowIndex: number, colIndex: number) => {
    const cell = rows[rowIndex]?.cells[colIndex];
    return (
      <>
        <MenuItem
          icon={Dices}
          label="Dado standard"
          disabled={cell?.mode !== 'custom'}
          onSelect={() => {
            if (cell) updateCell(rowIndex, colIndex, { mode: 'standard' });
            closeMenu();
          }}
        />
        <div className="my-1 h-px bg-[var(--dash-border-soft)]" />
        {customDiceLoading ? (
          <p className="px-2.5 py-1.5 text-xs text-[var(--dash-muted)]">Caricamento dadi…</p>
        ) : customDice.length === 0 ? (
          <p className="px-2.5 py-1.5 text-xs text-[var(--dash-muted)]">Nessun dado Custom salvato.</p>
        ) : (
          customDice.map((die) => (
            <MenuItem
              key={die.id}
              icon={Dices}
              label={die.name}
              onSelect={() => {
                updateCell(rowIndex, colIndex, {
                  mode: 'custom',
                  customDie: toCustomDieRollSnapshot(die),
                  quantity: Math.max(1, cell?.quantity ?? 1),
                });
                closeMenu();
              }}
            />
          ))
        )}
      </>
    );
  };

  const columnMenu = (colIndex: number) => {
    const isFirst = colIndex === 0;
    const isSecond = colIndex === 1;
    return (
      <>
        <MenuItem
          icon={Pencil}
          label="Rinomina"
          onSelect={() => {
            setRenamingColumn(columns[colIndex]?.id ?? null);
            closeMenu();
          }}
        />
        <MenuItem icon={ArrowUp} label="Ordinamento crescente" onSelect={() => sortByColumn(colIndex, 'asc')} />
        <MenuItem icon={ArrowDown} label="Ordinamento decrescente" onSelect={() => sortByColumn(colIndex, 'desc')} />
        {isFirst ? (
          <MenuItem icon={Plus} label="Aggiungi una colonna dopo" onSelect={() => addColumnAt(colIndex + 1)} />
        ) : (
          <>
            <MenuItem icon={Plus} label="Aggiungi una colonna prima" onSelect={() => addColumnAt(colIndex)} />
            <MenuItem icon={Plus} label="Aggiungi una colonna dopo" onSelect={() => addColumnAt(colIndex + 1)} />
            <MenuItem
              icon={ArrowLeft}
              label="Muovi a sinistra"
              disabled={isSecond}
              onSelect={() => moveColumn(colIndex, -1)}
            />
            <MenuItem
              icon={ArrowRight}
              label="Muovi a destra"
              disabled={colIndex >= columns.length - 1}
              onSelect={() => moveColumn(colIndex, 1)}
            />
            <MenuItem icon={Type} label="Converti tutto in testo" onSelect={() => convertColumn(colIndex, 'text')} />
            <MenuItem icon={Dices} label="Converti tutto in dadi" onSelect={() => convertColumn(colIndex, 'dice')} />
            <MenuItem icon={Cog} label="Converti tutto in Modificatori" onSelect={() => convertColumn(colIndex, 'modifier')} />
            <MenuItem
              icon={SquareCheckBig}
              label="Converti tutto in Checkbox"
              onSelect={() => convertColumn(colIndex, 'checkbox')}
            />
            <MenuItem icon={Gauge} label="Converti tutto in punti" onSelect={() => convertColumn(colIndex, 'points')} />
            <MenuItem
              icon={Trash2}
              label="Cancella colonna"
              danger
              disabled={columns.length <= 2}
              onSelect={() => deleteColumnAt(colIndex)}
            />
          </>
        )}
      </>
    );
  };

  return (
    <NodeViewWrapper className="tiptap-archivio" data-archivio-root="true">
      <div
        contentEditable={false}
        className="overflow-hidden rounded-[var(--note-block-radius)] border border-[var(--dash-border-soft)] bg-[var(--dash-panel)]"
      >
        <div className="flex items-center justify-between gap-2 px-[var(--note-block-padding-x)] py-[var(--note-block-padding-y)]">
          <div className="min-w-0 flex-1">
            {titleVisible ? (
              <input
                value={title}
                onChange={(event) => updateAttributes({ title: event.target.value })}
                onMouseDown={(event) => event.stopPropagation()}
                onKeyDown={(event) => {
                  event.stopPropagation();
                  if (event.key === 'Enter') (event.target as HTMLInputElement).blur();
                }}
                aria-label="Titolo archivio"
                placeholder="Archivio"
                className="w-full min-w-0 bg-transparent text-sm font-bold text-[var(--dash-text-strong)] outline-none placeholder:text-[var(--dash-muted)]"
              />
            ) : null}
          </div>
          <div className="flex shrink-0 items-center gap-1">
            <TriggerButton label="Aggiungi riga" onOpen={() => addRow(null, rows.length)}>
              <Plus className="h-4 w-4" aria-hidden="true" />
            </TriggerButton>
            <TriggerButton
              label="Menu archivio"
              onOpen={(event) => {
                if (menu?.scope === 'block') closeMenu();
                else openMenu({ scope: 'block' }, event);
              }}
            >
              <MoreVertical className="h-4 w-4" aria-hidden="true" />
            </TriggerButton>
          </div>
          {menu?.scope === 'block' && (
            <MenuPortal anchor={anchor}>
              <MenuItem icon={Plus} label="Aggiungi riga" onSelect={() => addRow(null, rows.length)} />
              <MenuItem icon={Plus} label="Aggiungi colonna" onSelect={() => addColumnAt(columns.length)} />
              <MenuItem
                icon={titleVisible ? EyeOff : Eye}
                label={titleVisible ? 'Nascondi il Titolo' : 'Mostra il Titolo'}
                onSelect={() => set({ titleVisible: !titleVisible })}
              />
              <MenuItem icon={Copy} label="Duplica" onSelect={duplicateArchive} />
              <MenuItem icon={Clipboard} label="Copia" onSelect={copyArchive} />
              <MenuItem icon={Trash2} label="Elimina" danger onSelect={deleteArchive} />
            </MenuPortal>
          )}
        </div>

        <div className="overflow-x-auto px-2 pb-2">
          <table className="w-full border-collapse" style={{ tableLayout: 'fixed' }}>
            <colgroup>
              {columns.map((column) => (
                <col key={column.id} style={{ width: column.width }} />
              ))}
            </colgroup>
            <thead>
              <tr>
                {columns.map((column, colIndex) => (
                  <th
                    key={column.id}
                    className="group/cell relative border-b border-[var(--dash-border-soft)] px-[var(--note-cell-padding-x)] py-[var(--note-cell-padding-y)] text-left align-middle"
                  >
                    <span className="relative flex min-w-0 items-center gap-1">
                      {renamingColumn === column.id ? (
                        <input
                          autoFocus
                          value={column.label}
                          onChange={(event) =>
                            updateAttributes({
                              columns: columns.map((item) =>
                                item.id === column.id ? { ...item, label: event.target.value } : item,
                              ),
                            })
                          }
                          onBlur={() => setRenamingColumn(null)}
                          onMouseDown={(event) => event.stopPropagation()}
                          onKeyDown={(event) => {
                            event.stopPropagation();
                            if (event.key === 'Enter') setRenamingColumn(null);
                            if (event.key === 'Escape') setRenamingColumn(null);
                          }}
                          aria-label="Rinomina colonna"
                          className="min-w-0 flex-1 rounded border border-[var(--dash-accent)] bg-[var(--dash-surface)] px-1 py-0.5 text-xs text-[var(--dash-text)] outline-none"
                        />
                      ) : (
                        <span className="min-w-0 flex-1 truncate text-xs font-medium text-[var(--dash-muted)]">
                          {column.label}
                        </span>
                      )}
                      <TriggerButton
                        label={`Menu colonna ${column.label}`}
                        className={HOVER_DOTS}
                        onOpen={(event) => {
                          if (menu?.scope === 'column' && menu.col === colIndex) closeMenu();
                          else openMenu({ scope: 'column', col: colIndex }, event);
                        }}
                      >
                        <MoreVertical className="h-3.5 w-3.5" aria-hidden="true" />
                      </TriggerButton>
                    </span>
                    {menu?.scope === 'column' && menu.col === colIndex && (
                      <MenuPortal anchor={anchor}>{columnMenu(colIndex)}</MenuPortal>
                    )}
                    {colIndex < columns.length - 1 && (
                      <span
                        role="separator"
                        aria-label="Ridimensiona colonna"
                        contentEditable={false}
                        onMouseDown={(event) => startResize(event, colIndex)}
                        className="tiptap-archivio-resize-handle"
                      />
                    )}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row, rowIndex) => (
                <tr key={row.id} className="border-b border-[var(--dash-border-soft)] last:border-b-0">
                  {row.cells.map((cell, colIndex) => (
                    <td key={cell.id} className="group/cell relative px-[var(--note-cell-padding-x)] py-[var(--note-cell-padding-y)] align-middle">
                      {colIndex === 0 ? (
                        <span className="relative flex min-w-0 items-center gap-1">
                          <span className="flex min-w-0 flex-1 items-center">
                            {renderCellEditor(cell, rowIndex, colIndex)}
                          </span>
                          <TriggerButton
                            label={`Menu riga ${rowIndex + 1}`}
                            className={HOVER_DOTS}
                            onOpen={(event) => {
                              if (menu?.scope === 'row' && menu.row === rowIndex) closeMenu();
                              else openMenu({ scope: 'row', row: rowIndex }, event);
                            }}
                          >
                            <MoreVertical className="h-3.5 w-3.5" aria-hidden="true" />
                          </TriggerButton>
                          {menu?.scope === 'row' && menu.row === rowIndex && (
                            <MenuPortal anchor={anchor}>
                              <MenuItem icon={Plus} label="Aggiungi riga prima" onSelect={() => addRow(rowIndex, rowIndex)} />
                              <MenuItem
                                icon={Plus}
                                label="Aggiungi riga dopo"
                                onSelect={() => addRow(rowIndex, rowIndex + 1)}
                              />
                              <MenuItem
                                icon={Plus}
                                label="Aggiungi colonna dopo"
                                onSelect={() => addColumnAt(columns.length)}
                              />
                              <MenuItem
                                icon={ArrowUp}
                                label="Muovi riga sopra"
                                disabled={rowIndex <= 0}
                                onSelect={() => moveRow(rowIndex, -1)}
                              />
                              <MenuItem
                                icon={ArrowDown}
                                label="Muovi riga sotto"
                                disabled={rowIndex >= rows.length - 1}
                                onSelect={() => moveRow(rowIndex, 1)}
                              />
                              <MenuItem icon={Trash2} label="Cancella riga" danger onSelect={() => deleteRowAt(rowIndex)} />
                            </MenuPortal>
                          )}
                        </span>
                      ) : (
                        <span className="relative flex min-w-0 items-center gap-1">
                          <span className="flex min-w-0 flex-1 items-center justify-center">
                            {renderCellEditor(cell, rowIndex, colIndex)}
                          </span>
                          <TriggerButton
                            label={`Menu cella ${columnLabel(columns[colIndex])} riga ${rowIndex + 1}`}
                            className={HOVER_DOTS}
                            onOpen={(event) => {
                              if (menu?.scope === 'cell' && menu.row === rowIndex && menu.col === colIndex) closeMenu();
                              else openMenu({ scope: 'cell', row: rowIndex, col: colIndex }, event);
                            }}
                          >
                            <MoreVertical className="h-3.5 w-3.5" aria-hidden="true" />
                          </TriggerButton>
                          {menu?.scope === 'cell' && menu.row === rowIndex && menu.col === colIndex && (
                            <MenuPortal anchor={anchor}>{transformItems(cell, rowIndex, colIndex)}</MenuPortal>
                          )}
                          {menu?.scope === 'dice' && menu.row === rowIndex && menu.col === colIndex && (
                            <MenuPortal anchor={anchor}>{dicePickerItems(rowIndex, colIndex)}</MenuPortal>
                          )}
                        </span>
                      )}
                      {colIndex < columns.length - 1 && (
                        <span
                          role="separator"
                          aria-label="Ridimensiona colonna"
                          contentEditable={false}
                          onMouseDown={(event) => startResize(event, colIndex)}
                          className="tiptap-archivio-resize-handle"
                        />
                      )}
                    </td>
                  ))}
                </tr>
              ))}
              {rows.length === 0 && (
                <tr>
                  <td colSpan={columns.length} className="px-2 py-3 text-center text-xs text-[var(--dash-muted)]">
                    Nessuna riga: premi + per aggiungere la prima.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </NodeViewWrapper>
  );
}

function columnLabel(column: ArchivioColumn | undefined): string {
  return column?.label ?? '';
}

export type ArchivioSortValue = string | number;

export function archivioSortValueForTest(cell: ArchivioCell): ArchivioSortValue {
  return archivioCellSortValue(cell);
}
