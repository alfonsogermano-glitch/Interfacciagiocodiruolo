import { useCallback, useEffect, useMemo, useState, type ReactElement } from 'react';
import { createPortal } from 'react-dom';
import type { Editor } from '@tiptap/react';
import { usePortalContainer } from '../../ui/portal-container';
import {
  NOTE_COMMANDS,
  canRunNoteCommand,
  runSlashNoteCommand,
  runSecondaryNoteCommand,
  type NoteCommandDescriptor,
  type NoteCommandId,
  type NoteSecondaryValue,
} from './noteEditorCommands';
import { placeFloatingNoteUI } from './noteFloatingPosition';
import {
  closeNoteSlashMenu,
  getNoteSlashPosition,
  isValidNoteSlashTrigger,
  removeNoteSlashTrigger,
} from './tiptapNoteSlashMenu';
import {
  NoteFontFamilyPicker,
  NoteFontSizePicker,
  NoteImagePicker,
  NoteInlineIconPicker,
} from './NoteContextualPickers';

interface NoteSlashMenuProps { editor: Editor; editable: boolean }
interface MenuState { slashPos: number; top: number; left: number }

function commandButton(command: NoteCommandDescriptor, disabled: boolean, highlighted: boolean, onActivate: () => void, onHover: () => void): ReactElement {
  const Icon = command.icon;
  return (
    <button
      key={command.id}
      type="button"
      role="menuitem"
      aria-label={command.label}
      aria-disabled={disabled}
      onPointerDown={(event) => {
        if (!disabled) return;
        event.preventDefault();
        event.stopPropagation();
      }}
      onMouseDown={(event) => event.preventDefault()}
      onClick={(event) => {
        if (disabled) {
          event.preventDefault();
          event.stopPropagation();
          return;
        }
        onActivate();
      }}
      onMouseEnter={onHover}
      className={`flex min-h-12 flex-col items-center justify-center gap-1 rounded-md px-1 py-1.5 text-center transition-colors ${
        disabled
          ? 'cursor-not-allowed text-[var(--dash-muted)] opacity-35'
          : highlighted
            ? 'cursor-pointer bg-[var(--dash-accent)] text-[var(--dash-text-strong)] ring-1 ring-inset ring-[var(--dash-accent-2)]'
            : 'cursor-pointer text-[var(--dash-text)] hover:bg-[var(--dash-accent)] hover:text-[var(--dash-text-strong)] hover:ring-1 hover:ring-inset hover:ring-[var(--dash-accent-2)]'
      }`}
    >
      <Icon className="h-4 w-4" />
      <span className="max-w-full truncate text-[9px] leading-tight">{command.label}</span>
    </button>
  );
}

export function NoteSlashMenu({ editor, editable }: NoteSlashMenuProps) {
  const portalContainer = usePortalContainer();
  const [state, setState] = useState<MenuState | null>(null);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [openSecondaryId, setOpenSecondaryId] = useState<NoteCommandId | null>(null);
  const commands = useMemo(() => NOTE_COMMANDS.filter((command) => command.id !== 'undo'), []);

  const refresh = useCallback(() => {
    if (!editable) {
      setState(null);
      return;
    }
    const slashPos = getNoteSlashPosition(editor.state);
    if (slashPos === null) {
      setState(null);
      setOpenSecondaryId(null);
      return;
    }
    if (!isValidNoteSlashTrigger(editor.state, slashPos)) {
      closeNoteSlashMenu(editor);
      setState(null);
      return;
    }
    const { selection } = editor.state;
    if (!selection.empty || selection.from !== slashPos + 1) {
      closeNoteSlashMenu(editor);
      setState(null);
      return;
    }
    const coords = editor.view.coordsAtPos(slashPos + 1);
    const placed = placeFloatingNoteUI(coords, 248, Math.min(420, window.innerHeight * 0.7), 8);
    setState({ slashPos, ...placed });
  }, [editor, editable]);

  useEffect(() => {
    refresh();
    editor.on('transaction', refresh);
    editor.on('selectionUpdate', refresh);
    window.addEventListener('resize', refresh);
    window.addEventListener('scroll', refresh, true);
    return () => {
      editor.off('transaction', refresh);
      editor.off('selectionUpdate', refresh);
      window.removeEventListener('resize', refresh);
      window.removeEventListener('scroll', refresh, true);
    };
  }, [editor, refresh]);

  const enabledIndices = useCallback(() => commands
    .map((command, index) => canRunNoteCommand(editor, command) ? index : -1)
    .filter((index) => index >= 0), [commands, editor]);

  useEffect(() => {
    if (!state) return;
    const indices = enabledIndices();
    if (!indices.length) setSelectedIndex(-1);
    else if (!indices.includes(selectedIndex)) setSelectedIndex(indices[0]);
  }, [state, editor.state, enabledIndices, selectedIndex]);

  const execute = useCallback((command: NoteCommandDescriptor) => {
    if (!canRunNoteCommand(editor, command) || command.secondaryPicker) return;
    const slashPos = getNoteSlashPosition(editor.state);
    if (slashPos === null || !runSlashNoteCommand(editor, command.id, slashPos)) {
      closeNoteSlashMenu(editor);
    }
  }, [editor]);

  const activate = useCallback((command: NoteCommandDescriptor) => {
    if (!canRunNoteCommand(editor, command)) return;
    if (command.secondaryPicker) {
      setOpenSecondaryId(command.id);
      return;
    }
    execute(command);
  }, [editor, execute]);

  const applySecondary = useCallback((value: NoteSecondaryValue) => {
    const slashPos = getNoteSlashPosition(editor.state);
    if (slashPos === null || !removeNoteSlashTrigger(editor, slashPos)) {
      closeNoteSlashMenu(editor);
      return;
    }
    runSecondaryNoteCommand(editor, value);
    setOpenSecondaryId(null);
  }, [editor]);

  useEffect(() => {
    if (!state) return;
    const dom = editor.view.dom;
    const onKeyDown = (event: KeyboardEvent) => {
      if (openSecondaryId) return;
      if (event.key === 'Escape' || event.key === 'Backspace' || event.key === 'Delete') {
        event.preventDefault();
        event.stopPropagation();
        closeNoteSlashMenu(editor);
        return;
      }
      if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
        event.preventDefault();
        const indices = enabledIndices();
        if (!indices.length) return;
        const current = indices.indexOf(selectedIndex);
        const delta = event.key === 'ArrowDown' ? 1 : -1;
        const next = current < 0 ? 0 : (current + delta + indices.length) % indices.length;
        setSelectedIndex(indices[next]);
        return;
      }
      if (event.key === 'Enter') {
        const command = commands[selectedIndex];
        if (!command || !canRunNoteCommand(editor, command)) return;
        event.preventDefault();
        activate(command);
      }
    };
    dom.addEventListener('keydown', onKeyDown, true);
    return () => dom.removeEventListener('keydown', onKeyDown, true);
  }, [state, editor, commands, selectedIndex, enabledIndices, activate, openSecondaryId]);

  useEffect(() => {
    if (!state) return;
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as Element | null;
      if (target?.closest('[data-note-slash-menu="true"], [data-note-contextual-picker="true"]')) return;
      closeNoteSlashMenu(editor);
    };
    document.addEventListener('pointerdown', onPointerDown, true);
    return () => document.removeEventListener('pointerdown', onPointerDown, true);
  }, [state, editor]);

  if (!editable || !state) return null;

  const renderCommand = (command: NoteCommandDescriptor, index: number) => {
    const disabled = !canRunNoteCommand(editor, command);
    const button = commandButton(
      command,
      disabled,
      selectedIndex === index && !disabled,
      () => activate(command),
      () => setSelectedIndex(disabled ? -1 : index),
    );
    if (disabled || !command.secondaryPicker) return button;

    const common = {
      trigger: button,
      open: openSecondaryId === command.id,
      onOpenChange: (open: boolean) => {
        if (open) setOpenSecondaryId(command.id);
        else {
          const wasOpen = openSecondaryId === command.id;
          setOpenSecondaryId(null);
          if (wasOpen && getNoteSlashPosition(editor.state) !== null) closeNoteSlashMenu(editor);
        }
      },
    };
    switch (command.id) {
      case 'fontSize': return <NoteFontSizePicker key={command.id} {...common} onChoose={(size) => applySecondary({ commandId: 'fontSize', size })} />;
      case 'fontFamily': return <NoteFontFamilyPicker key={command.id} {...common} onChoose={(label) => applySecondary({ commandId: 'fontFamily', label })} />;
      case 'image': return <NoteImagePicker key={command.id} {...common} onChoose={(src) => applySecondary({ commandId: 'image', src })} />;
      case 'inlineIcon': return <NoteInlineIconPicker key={command.id} {...common} onChoose={(name) => applySecondary({ commandId: 'inlineIcon', name })} />;
      default: return button;
    }
  };

  const content = (
    <div
      data-note-contextual-ui="true"
      data-note-slash-menu="true"
      role="menu"
      aria-label="Comandi Nota"
      style={{ position: 'fixed', top: state.top, left: state.left, zIndex: 9998 }}
      className="tiptap-slash-menu w-[248px] max-h-[min(70vh,420px)] overflow-y-auto rounded-lg border border-[var(--dash-border-soft)] bg-[var(--dash-panel)] p-2 shadow-lg"
    >
      {(['text', 'block'] as const).map((group) => (
        <div key={group} className="mb-2 last:mb-0">
          <div className="mb-1 px-1 text-[10px] font-medium uppercase tracking-wide text-[var(--dash-muted)]">{group === 'text' ? 'Testo' : 'Blocchi'}</div>
          <div className="grid grid-cols-4 gap-1">
            {commands.map((command, index) => command.group === group ? renderCommand(command, index) : null)}
          </div>
        </div>
      ))}
    </div>
  );

  return createPortal(content, portalContainer ?? document.body);
}
