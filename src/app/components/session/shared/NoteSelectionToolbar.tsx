import { useCallback, useEffect, useMemo, useState, type ReactElement } from 'react';
import { createPortal } from 'react-dom';
import type { Editor } from '@tiptap/react';
import { usePortalContainer } from '../../ui/portal-container';
import {
  NOTE_COMMANDS,
  canRunNoteCommand,
  runImmediateNoteCommand,
  runSecondaryNoteCommand,
  type NoteCommandDescriptor,
  type NoteSecondaryValue,
} from './noteEditorCommands';
import {
  captureNoteSelection,
  restoreNoteSelection,
  type NoteSelectionSnapshot,
} from './noteSelectionSnapshot';
import { placeFloatingNoteUI } from './noteFloatingPosition';
import { getNoteSlashPosition } from './tiptapNoteSlashMenu';
import { NoteFontFamilyPicker, NoteFontSizePicker } from './NoteContextualPickers';

interface Props { editor: Editor; editable: boolean }

function sameSnapshot(a: NoteSelectionSnapshot | null, b: NoteSelectionSnapshot | null) {
  return !!a && !!b && a.doc === b.doc && a.from === b.from && a.to === b.to;
}

function selectionRect(editor: Editor, snapshot: NoteSelectionSnapshot): DOMRect {
  const native = window.getSelection();
  if (native?.rangeCount) {
    const range = native.getRangeAt(0);
    const common = range.commonAncestorContainer instanceof Element
      ? range.commonAncestorContainer
      : range.commonAncestorContainer.parentElement;
    if (common && editor.view.dom.contains(common)) return range.getBoundingClientRect();
  }
  const start = editor.view.coordsAtPos(snapshot.from);
  const end = editor.view.coordsAtPos(snapshot.to);
  return new DOMRect(
    Math.min(start.left, end.left),
    Math.min(start.top, end.top),
    Math.max(1, Math.abs(end.right - start.left)),
    Math.max(start.bottom, end.bottom) - Math.min(start.top, end.top),
  );
}

export function NoteSelectionToolbar({ editor, editable }: Props) {
  const portalContainer = usePortalContainer();
  const commands = useMemo(() => NOTE_COMMANDS.filter((command) => command.selectionEligible), []);
  const [snapshot, setSnapshot] = useState<NoteSelectionSnapshot | null>(null);
  const [dismissed, setDismissed] = useState<NoteSelectionSnapshot | null>(null);
  const [position, setPosition] = useState<{ top: number; left: number } | null>(null);
  const [openPicker, setOpenPicker] = useState<'fontSize' | 'fontFamily' | null>(null);

  const refresh = useCallback(() => {
    if (!editable || getNoteSlashPosition(editor.state) !== null) {
      setSnapshot(null);
      setPosition(null);
      return;
    }
    const next = captureNoteSelection(editor.state);
    if (!next) {
      setSnapshot(null);
      setDismissed(null);
      setPosition(null);
      setOpenPicker(null);
      return;
    }
    const isDismissed = sameSnapshot(dismissed, next);
    if (dismissed && !isDismissed) setDismissed(null);
    if (isDismissed) {
      setSnapshot(null);
      setPosition(null);
      return;
    }
    setSnapshot(next);
    const rect = selectionRect(editor, next);
    setPosition(placeFloatingNoteUI(rect, 440, 44, 8));
  }, [editor, editable, dismissed]);

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

  const withSelection = useCallback((action: () => boolean) => {
    if (!snapshot || !restoreNoteSelection(editor, snapshot)) {
      setSnapshot(null);
      return false;
    }
    return action();
  }, [editor, snapshot]);

  const runImmediate = (command: NoteCommandDescriptor) => {
    withSelection(() => runImmediateNoteCommand(editor, command.id));
  };

  const applySecondary = (value: NoteSecondaryValue) => {
    withSelection(() => runSecondaryNoteCommand(editor, value));
    setOpenPicker(null);
  };

  useEffect(() => {
    if (!snapshot) return;
    const dismiss = () => {
      setDismissed(snapshot);
      setSnapshot(null);
      setPosition(null);
      setOpenPicker(null);
    };
    const editorKey = (event: KeyboardEvent) => {
      const modifier = event.ctrlKey || event.metaKey;
      const key = event.key.toLowerCase();
      if (modifier && ['c', 'x', 'v'].includes(key)) {
        dismiss();
        return;
      }
      if (event.key === 'Escape') dismiss();
    };
    const documentKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') dismiss();
    };
    editor.view.dom.addEventListener('keydown', editorKey, true);
    document.addEventListener('keydown', documentKey, true);
    return () => {
      editor.view.dom.removeEventListener('keydown', editorKey, true);
      document.removeEventListener('keydown', documentKey, true);
    };
  }, [editor, snapshot]);

  if (!editable || !snapshot || !position) return null;

  const buttonFor = (command: NoteCommandDescriptor): ReactElement => {
    const Icon = command.icon;
    const disabled = !canRunNoteCommand(editor, command);
    return (
      <button
        key={command.id}
        type="button"
        aria-label={command.label}
        disabled={disabled}
        aria-pressed={command.isActive(editor)}
        onMouseDown={(event) => event.preventDefault()}
        onClick={() => !command.secondaryPicker && runImmediate(command)}
        className={`flex h-8 w-8 items-center justify-center rounded-md transition-colors ${
          command.isActive(editor) ? 'bg-[var(--dash-accent)] text-[var(--dash-text-strong)] ring-1 ring-inset ring-[var(--dash-accent-2)]' : 'text-[var(--dash-muted)] hover:bg-[var(--dash-accent)] hover:text-[var(--dash-text-strong)] hover:ring-1 hover:ring-inset hover:ring-[var(--dash-accent-2)]'
        } ${disabled ? 'cursor-not-allowed opacity-35' : ''}`}
      >
        <Icon className="h-4 w-4" />
      </button>
    );
  };

  const content = (
    <div
      data-note-contextual-ui="true"
      data-note-selection-toolbar="true"
      role="toolbar"
      aria-label="Formattazione testo selezionato"
      style={{ position: 'fixed', top: position.top, left: position.left, zIndex: 9998 }}
      className="tiptap-selection-toolbar flex max-w-[calc(100vw-16px)] items-center gap-0.5 rounded-lg border border-[var(--dash-border-soft)] bg-[var(--dash-panel)] p-1 shadow-lg"
    >
      {commands.map((command) => {
        const button = buttonFor(command);
        if (command.id === 'fontSize') {
          return <NoteFontSizePicker key={command.id} trigger={button} open={openPicker === 'fontSize'} onOpenChange={(open) => setOpenPicker(open ? 'fontSize' : null)} onChoose={(size) => applySecondary({ commandId: 'fontSize', size })} />;
        }
        if (command.id === 'fontFamily') {
          return <NoteFontFamilyPicker key={command.id} trigger={button} open={openPicker === 'fontFamily'} onOpenChange={(open) => setOpenPicker(open ? 'fontFamily' : null)} onChoose={(label) => applySecondary({ commandId: 'fontFamily', label })} />;
        }
        return button;
      })}
    </div>
  );

  return createPortal(content, portalContainer ?? document.body);
}
