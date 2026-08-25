import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import type { Editor } from '@tiptap/react';
import {
  BetweenHorizontalEnd,
  BetweenHorizontalStart,
  BetweenVerticalEnd,
  BetweenVerticalStart,
  Copy,
  Eye,
  EyeOff,
  PanelLeft,
  PanelTop,
  Trash2,
} from 'lucide-react';
import { Tooltip, TooltipContent, TooltipTrigger } from '../../ui/tooltip';
import { usePortalContainer } from '../../ui/portal-container';
import { findActiveTable, type ActiveNoteTable } from './tiptapNoteTable';
import { writeTableToClipboard } from './noteTableClipboard';
import { getNoteTableToolbarLeft } from './noteTableToolbarPosition';

interface NoteTableToolbarProps { editor: Editor; editable: boolean }
interface ToolbarPosition { top: number; left: number }

function findRenderedNoteTable(dom: Node | null): HTMLTableElement | null {
  const element = dom instanceof HTMLElement ? dom : dom?.parentElement;
  if (!element) return null;
  if (element instanceof HTMLTableElement && element.classList.contains('tiptap-note-table')) return element;
  return element.querySelector('table.tiptap-note-table');
}

function findHorizontalScrollViewport(element: HTMLElement): HTMLElement | null {
  for (let current = element.parentElement; current; current = current.parentElement) {
    const overflowX = window.getComputedStyle(current).overflowX;
    if (overflowX === 'auto' || overflowX === 'scroll') return current;
  }
  return null;
}

function TableActionButton({ label, disabled, onClick, children }: { label: string; disabled?: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          aria-label={label}
          disabled={disabled}
          onClick={onClick}
          className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-[var(--dash-muted)] transition-colors hover:bg-[var(--dash-surface-2)] hover:text-[var(--dash-text-strong)] ${disabled ? 'cursor-not-allowed opacity-35' : ''}`}
        >{children}</button>
      </TooltipTrigger>
      <TooltipContent side="right">{label}</TooltipContent>
    </Tooltip>
  );
}

function DeleteRowIcon() {
  return (
    <svg data-remove-table-part="row" viewBox="0 0 20 20" className="h-4 w-4" aria-hidden="true">
      <rect x="2" y="5" width="13" height="6" rx="2" fill="currentColor" />
      <path d="m10.5 9.5 5 5m0-5-5 5" stroke="var(--dash-panel)" strokeWidth="4" strokeLinecap="round" />
      <path d="m10.5 9.5 5 5m0-5-5 5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

function DeleteColumnIcon() {
  return (
    <svg data-remove-table-part="column" viewBox="0 0 20 20" className="h-4 w-4" aria-hidden="true">
      <rect x="5" y="2" width="6" height="13" rx="2" fill="currentColor" />
      <path d="m10.5 9.5 5 5m0-5-5 5" stroke="var(--dash-panel)" strokeWidth="4" strokeLinecap="round" />
      <path d="m10.5 9.5 5 5m0-5-5 5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

export function NoteTableToolbar({ editor, editable }: NoteTableToolbarProps) {
  const portalContainer = usePortalContainer();
  const [activeTable, setActiveTable] = useState<ActiveNoteTable | null>(null);
  const [position, setPosition] = useState<ToolbarPosition | null>(null);

  const refresh = useCallback(() => {
    if (!editable) { setActiveTable(null); setPosition(null); return; }
    const nextActiveTable = findActiveTable(editor.state);
    if (!nextActiveTable) { setActiveTable(null); setPosition(null); return; }
    const dom = editor.view.nodeDOM(nextActiveTable.pos);
    const table = findRenderedNoteTable(dom);
    if (!table) { setActiveTable(nextActiveTable); setPosition(null); return; }
    const rect = table.getBoundingClientRect();
    if (rect.bottom < 0 || rect.top > window.innerHeight) { setActiveTable(nextActiveTable); setPosition(null); return; }
    const horizontalViewport = findHorizontalScrollViewport(table);
    const visibleRect = horizontalViewport?.getBoundingClientRect() ?? rect;
    const hasHorizontalOverflow = horizontalViewport
      ? rect.width > horizontalViewport.clientWidth + 1
      : false;
    const left = getNoteTableToolbarLeft({
      tableBounds: { left: rect.left, right: rect.right },
      visibleBounds: { left: visibleRect.left, right: visibleRect.right },
      hasHorizontalOverflow,
      viewportWidth: window.innerWidth,
    });
    const top = Math.max(8, Math.min(rect.top, window.innerHeight - 400));
    setActiveTable(nextActiveTable);
    setPosition({ top, left });
  }, [editor, editable]);

  useEffect(() => {
    refresh();
    editor.on('selectionUpdate', refresh);
    editor.on('transaction', refresh);
    window.addEventListener('resize', refresh);
    window.addEventListener('scroll', refresh, true);
    return () => {
      editor.off('selectionUpdate', refresh);
      editor.off('transaction', refresh);
      window.removeEventListener('resize', refresh);
      window.removeEventListener('scroll', refresh, true);
    };
  }, [editor, refresh]);

  const run = (command: () => void) => { command(); refresh(); };
  const copyActiveTable = async () => {
    const current = findActiveTable(editor.state);
    if (!current) return;
    try { await writeTableToClipboard(editor, current.node); }
    catch (error) {
      console.log('Errore copia tabella nota:', error);
      window.alert('Impossibile copiare la tabella negli appunti.');
    }
  };

  if (!editable || !activeTable || !position) return null;
  const gridVisible = activeTable.node.attrs.gridVisible !== false;

  return createPortal(
    <div
      data-note-contextual-ui="true"
      role="toolbar"
      aria-label="Strumenti tabella"
      onMouseDown={(event) => event.preventDefault()}
      style={{ position: 'fixed', top: position.top, left: position.left, zIndex: 9998 }}
      className="flex max-h-[calc(100vh-16px)] w-10 flex-col items-center gap-0.5 overflow-y-auto rounded-lg border border-[var(--dash-border-soft)] bg-[var(--dash-panel)] p-1 shadow-lg"
    >
      <TableActionButton label="Aggiungi riga prima" disabled={!editor.can().addRowBefore()} onClick={() => run(() => editor.chain().focus().addRowBefore().run())}><BetweenHorizontalStart className="h-4 w-4" /></TableActionButton>
      <TableActionButton label="Aggiungi riga dopo" disabled={!editor.can().addRowAfter()} onClick={() => run(() => editor.chain().focus().addRowAfter().run())}><BetweenHorizontalEnd className="h-4 w-4" /></TableActionButton>
      <TableActionButton label="Aggiungi colonna prima" disabled={!editor.can().addColumnBefore()} onClick={() => run(() => editor.chain().focus().addColumnBefore().run())}><BetweenVerticalStart className="h-4 w-4" /></TableActionButton>
      <TableActionButton label="Aggiungi colonna dopo" disabled={!editor.can().addColumnAfter()} onClick={() => run(() => editor.chain().focus().addColumnAfter().run())}><BetweenVerticalEnd className="h-4 w-4" /></TableActionButton>
      <TableActionButton label="Intestazione riga" disabled={!editor.can().toggleHeaderRow()} onClick={() => run(() => editor.chain().focus().toggleHeaderRow().run())}><PanelTop className="h-4 w-4" /></TableActionButton>
      <TableActionButton label="Intestazione colonna" disabled={!editor.can().toggleHeaderColumn()} onClick={() => run(() => editor.chain().focus().toggleHeaderColumn().run())}><PanelLeft className="h-4 w-4" /></TableActionButton>
      <TableActionButton label="Rimuovi riga" disabled={!editor.can().deleteRow()} onClick={() => run(() => editor.chain().focus().deleteRow().run())}><DeleteRowIcon /></TableActionButton>
      <TableActionButton label="Rimuovi colonna" disabled={!editor.can().deleteColumn()} onClick={() => run(() => editor.chain().focus().deleteColumn().run())}><DeleteColumnIcon /></TableActionButton>
      <TableActionButton label={gridVisible ? 'Nascondi griglia tabella' : 'Mostra griglia tabella'} disabled={!editor.can().toggleNoteTableGrid()} onClick={() => run(() => editor.chain().focus().toggleNoteTableGrid().run())}>{gridVisible ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}</TableActionButton>
      <TableActionButton label="Copia tabella" onClick={() => void copyActiveTable()}><Copy className="h-4 w-4" /></TableActionButton>
      <TableActionButton label="Elimina tabella" disabled={!editor.can().deleteTable()} onClick={() => run(() => editor.chain().focus().deleteTable().run())}><Trash2 className="h-4 w-4" /></TableActionButton>
    </div>,
    portalContainer ?? document.body,
  );
}
