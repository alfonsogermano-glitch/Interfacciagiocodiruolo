import { useCallback, useEffect, useState, type ReactNode } from 'react';
import type { Editor } from '@tiptap/react';
import {
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  Columns3,
  Copy,
  PanelLeft,
  PanelTop,
  Rows3,
  Trash2,
  X,
} from 'lucide-react';
import { Tooltip, TooltipContent, TooltipTrigger } from '../../ui/tooltip';
import { findActiveTable, type ActiveNoteTable } from './tiptapNoteTable';
import { writeTableToClipboard } from './noteTableClipboard';

interface NoteTableToolbarProps {
  editor: Editor;
  editable: boolean;
}

interface ToolbarPosition {
  top: number;
  left: number;
}

function TableActionButton({
  label,
  disabled,
  onClick,
  children,
}: {
  label: string;
  disabled?: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          aria-label={label}
          disabled={disabled}
          onClick={onClick}
          className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-[var(--dash-muted)] transition-colors hover:bg-[var(--dash-surface-2)] hover:text-[var(--dash-text-strong)] ${
            disabled ? 'cursor-not-allowed opacity-35' : ''
          }`}
        >
          {children}
        </button>
      </TooltipTrigger>
      <TooltipContent side="right">{label}</TooltipContent>
    </Tooltip>
  );
}

function DeleteRowIcon() {
  return (
    <span className="relative block h-4 w-4">
      <Rows3 className="absolute inset-0 h-4 w-4" />
      <X className="absolute -right-1 -top-1 h-2.5 w-2.5" />
    </span>
  );
}

function DeleteColumnIcon() {
  return (
    <span className="relative block h-4 w-4">
      <Columns3 className="absolute inset-0 h-4 w-4" />
      <X className="absolute -right-1 -top-1 h-2.5 w-2.5" />
    </span>
  );
}

export function NoteTableToolbar({ editor, editable }: NoteTableToolbarProps) {
  const [activeTable, setActiveTable] = useState<ActiveNoteTable | null>(null);
  const [position, setPosition] = useState<ToolbarPosition | null>(null);

  const refresh = useCallback(() => {
    if (!editable) {
      setActiveTable(null);
      setPosition(null);
      return;
    }

    const nextActiveTable = findActiveTable(editor.state);
    if (!nextActiveTable) {
      setActiveTable(null);
      setPosition(null);
      return;
    }

    const dom = editor.view.nodeDOM(nextActiveTable.pos);
    const element = dom instanceof HTMLElement ? dom : dom?.parentElement;
    if (!element) {
      setActiveTable(nextActiveTable);
      setPosition(null);
      return;
    }

    const rect = element.getBoundingClientRect();
    if (rect.bottom < 0 || rect.top > window.innerHeight) {
      setActiveTable(nextActiveTable);
      setPosition(null);
      return;
    }

    const toolbarWidth = 40;
    const gap = 8;
    const rightSide = rect.right + gap;
    const left = rightSide + toolbarWidth <= window.innerWidth - 8
      ? rightSide
      : Math.max(8, rect.left - toolbarWidth - gap);
    const top = Math.max(8, Math.min(rect.top, window.innerHeight - 360));

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

  const run = (command: () => void) => {
    command();
    refresh();
  };

  const copyActiveTable = async () => {
    const current = findActiveTable(editor.state);
    if (!current) return;
    try {
      await writeTableToClipboard(editor, current.node);
    } catch (error) {
      console.log('Errore copia tabella nota:', error);
      window.alert('Impossibile copiare la tabella negli appunti.');
    }
  };

  if (!editable || !activeTable || !position) return null;

  return (
    <div
      role="toolbar"
      aria-label="Strumenti tabella"
      onMouseDown={(event) => event.preventDefault()}
      style={{ position: 'fixed', top: position.top, left: position.left, zIndex: 9998 }}
      className="flex max-h-[calc(100vh-16px)] w-10 flex-col items-center gap-0.5 overflow-y-auto rounded-lg border border-[var(--dash-border-soft)] bg-[var(--dash-panel)] p-1 shadow-lg"
    >
      <TableActionButton
        label="Aggiungi riga prima"
        disabled={!editor.can().addRowBefore()}
        onClick={() => run(() => editor.chain().focus().addRowBefore().run())}
      >
        <ArrowUp className="h-4 w-4" />
      </TableActionButton>
      <TableActionButton
        label="Aggiungi riga dopo"
        disabled={!editor.can().addRowAfter()}
        onClick={() => run(() => editor.chain().focus().addRowAfter().run())}
      >
        <ArrowDown className="h-4 w-4" />
      </TableActionButton>
      <TableActionButton
        label="Aggiungi colonna prima"
        disabled={!editor.can().addColumnBefore()}
        onClick={() => run(() => editor.chain().focus().addColumnBefore().run())}
      >
        <ArrowLeft className="h-4 w-4" />
      </TableActionButton>
      <TableActionButton
        label="Aggiungi colonna dopo"
        disabled={!editor.can().addColumnAfter()}
        onClick={() => run(() => editor.chain().focus().addColumnAfter().run())}
      >
        <ArrowRight className="h-4 w-4" />
      </TableActionButton>
      <TableActionButton
        label="Intestazione riga"
        disabled={!editor.can().toggleHeaderRow()}
        onClick={() => run(() => editor.chain().focus().toggleHeaderRow().run())}
      >
        <PanelTop className="h-4 w-4" />
      </TableActionButton>
      <TableActionButton
        label="Intestazione colonna"
        disabled={!editor.can().toggleHeaderColumn()}
        onClick={() => run(() => editor.chain().focus().toggleHeaderColumn().run())}
      >
        <PanelLeft className="h-4 w-4" />
      </TableActionButton>
      <TableActionButton
        label="Rimuovi riga"
        disabled={!editor.can().deleteRow()}
        onClick={() => run(() => editor.chain().focus().deleteRow().run())}
      >
        <DeleteRowIcon />
      </TableActionButton>
      <TableActionButton
        label="Rimuovi colonna"
        disabled={!editor.can().deleteColumn()}
        onClick={() => run(() => editor.chain().focus().deleteColumn().run())}
      >
        <DeleteColumnIcon />
      </TableActionButton>
      <TableActionButton label="Copia tabella" onClick={() => void copyActiveTable()}>
        <Copy className="h-4 w-4" />
      </TableActionButton>
      <TableActionButton
        label="Elimina tabella"
        disabled={!editor.can().deleteTable()}
        onClick={() => run(() => editor.chain().focus().deleteTable().run())}
      >
        <Trash2 className="h-4 w-4" />
      </TableActionButton>
    </div>
  );
}
