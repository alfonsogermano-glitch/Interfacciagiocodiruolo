import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import type { Editor } from '@tiptap/react';
import { ArrowLeft, Clipboard, Copy, Maximize2, Minimize2, Pencil, Trash2, Type } from 'lucide-react';
import { usePortalContainer } from '../../ui/portal-container';
import { placeFloatingNoteUI } from './noteFloatingPosition';
import { NOTE_COMMANDS, type NoteCommandId } from './noteEditorCommands';
import { FONT_SIZES } from './tiptapFontSize';
import { FONT_FAMILIES } from './tiptapFontFamily';
import {
  copyModifierToClipboard,
  deleteModifierAt,
  duplicateModifierAt,
  getModifierAt,
  setModifierCompactAt,
  setModifierAttrs,
  MODIFIER_DEFAULT_NAME,
  NOTE_MODIFIER_MENU_EVENT,
  NOTE_MODIFIER_RENAME_EVENT,
  NOTE_MODIFIER_TITLE_FORMAT_EVENT,
  NOTE_MODIFIER_TITLE_MENU_CLOSE_EVENT,
  NOTE_MODIFIER_TITLE_MENU_DISMISS_EVENT,
  NOTE_MODIFIER_TITLE_MENU_EVENT,
  type ModifierTitleFormatCommand,
  type NoteModifierMenuRequest,
  type NoteModifierTitleFormatRequest,
  type NoteModifierTitleMenuRequest,
} from './tiptapInlineModifier';

const MENU_WIDTH = 184;
const MENU_HEIGHT = 236;
const MENU_ITEM_CLASS =
  'flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-left text-xs text-[var(--dash-text)] transition-colors hover:bg-[var(--dash-accent)] hover:text-[var(--dash-text-strong)]';
const DANGER_ITEM_CLASS =
  'flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-left text-xs text-[var(--dash-danger-strong)] transition-colors hover:bg-[var(--dash-danger)] hover:text-[var(--dash-text-strong)]';

interface NoteModifierMenuProps {
  editor: Editor;
  editable: boolean;
}

type MenuMode = 'menu' | 'rename' | 'edit';

function MenuAction({ label, icon: Icon, onActivate, danger = false, hint }: { label: string; icon: typeof Pencil; onActivate: () => void; danger?: boolean; hint?: string }) {
  return (
    <button
      type="button"
      role="menuitem"
      aria-label={label}
      onClick={(event) => {
        event.preventDefault();
        onActivate();
      }}
      onMouseDown={(event) => event.preventDefault()}
      className={danger ? DANGER_ITEM_CLASS : MENU_ITEM_CLASS}
    >
      <Icon className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
      <span className="truncate">{label}</span>
      {hint ? <span className="ml-auto shrink-0 text-[9px] text-[var(--dash-muted)]">{hint}</span> : null}
    </button>
  );
}

export function NoteModifierMenu({ editor, editable }: NoteModifierMenuProps) {
  const portalContainer = usePortalContainer();
  const [request, setRequest] = useState<NoteModifierMenuRequest | null>(null);
  const [mode, setMode] = useState<MenuMode>('menu');
  const [draft, setDraft] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  const close = useCallback(() => {
    setRequest(null);
    setMode('menu');
    editor.commands.focus();
  }, [editor]);

  // Apertura dal widget vanilla (CustomEvent su window).
  useEffect(() => {
    const onOpen = (event: Event) => {
      const detail = (event as CustomEvent<NoteModifierMenuRequest>).detail;
      setRequest(detail);
      setMode('menu');
    };
    window.addEventListener(NOTE_MODIFIER_MENU_EVENT, onOpen);
    return () => window.removeEventListener(NOTE_MODIFIER_MENU_EVENT, onOpen);
  }, []);

  // Se il Modificatore sparisce dal documento (cancellato altrove), chiudi.
  useEffect(() => {
    if (!editor || !request) return;
    const onTransaction = () => {
      if (!getModifierAt(editor.state, request.pos)) close();
    };
    editor.on('transaction', onTransaction);
    return () => { editor.off('transaction', onTransaction); };
  }, [editor, request, close]);

  // Chiusura su click fuori (il click sui puntini di un altro Modificatore
  // deve poter RIAPRIRE il menu allo stesso colpo, quindi non chiude).
  useEffect(() => {
    if (!request) return;
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as Element | null;
      if (!target) return;
      if (target.closest('[data-note-modifier-menu="true"]')) return;
      if (target.closest('.tiptap-inline-modifier-widget')) return;
      close();
    };
    document.addEventListener('pointerdown', onPointerDown, true);
    return () => document.removeEventListener('pointerdown', onPointerDown, true);
  }, [request, close]);

  // Escape chiude e restituisce il focus all'editor.
  useEffect(() => {
    if (!request) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      event.stopPropagation();
      close();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [request, close]);

  // Focus automatico sull'input di rinomina/modifica.
  useEffect(() => {
    if (mode === 'menu' || !request) return;
    inputRef.current?.focus();
  }, [mode, request]);

  const applyAt = useCallback((apply: (state: NonNullable<ReturnType<Editor['state']['tr']['setMeta']> extends never ? never : never>, dispatch: (tr: NonNullable<ReturnType<Editor['state']['tr']['setMeta']> extends never ? never : never>) => void, pos: number) => boolean) => {
    if (!request) return;
    const { view } = editor;
    if (!getModifierAt(view.state, request.pos)) {
      close();
      return;
    }
    // IL TIPO DELLA RIGA SOTTO È INIETTATO DI SOTTO: apply è uno dei
    // setter esportati di tiptapInlineModifier che firmano
    // (state, dispatch, pos). Il cast qui sotto allarga solo per evitare
    // di ri-importare EditorState/Transaction nel componente.
    type ModifierSetter = (state: unknown, dispatch: unknown, pos: number) => boolean;
    (apply as unknown as ModifierSetter)(view.state, (tr: unknown) => view.dispatch(tr as never), request.pos);
    close();
  }, [editor, request, close]);

  if (applyAt) { /* noop: tieni il riferimento letto sopra */ }

  if (!editable) return null;

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (!request) return;
    const value = draft.trim();
    if (mode === 'rename') {
      applyAt((state, dispatch, pos) => setModifierAttrs(state as never, dispatch as never, pos, { name: value || MODIFIER_DEFAULT_NAME }));
    } else if (mode === 'edit') {
      applyAt((state, dispatch, pos) => setModifierAttrs(state as never, dispatch as never, pos, { value }));
    }
  };

  const startRename = () => {
    if (!request) return;
    window.dispatchEvent(new CustomEvent(NOTE_MODIFIER_RENAME_EVENT, { detail: { pos: request.pos } }));
    setRequest(null);
    setMode('menu');
  };

  const startEdit = () => {
    if (!request) return;
    const data = getModifierAt(editor.state, request.pos);
    setDraft(data?.value ?? '');
    setMode('edit');
  };

  const runCompact = (compact: boolean) => {
    if (!request) return;
    const { view } = editor;
    if (!getModifierAt(view.state, request.pos)) { close(); return; }
    setModifierCompactAt(view.state, (tr) => view.dispatch(tr), request.pos, compact);
    close();
  };

  const runDuplicate = () => {
    if (!request) return;
    const { view } = editor;
    if (!getModifierAt(view.state, request.pos)) { close(); return; }
    duplicateModifierAt(view.state, (tr) => view.dispatch(tr), request.pos);
    close();
  };

  const runCopy = async () => {
    if (!request) return;
    const { view } = editor;
    if (!getModifierAt(view.state, request.pos)) { close(); return; }
    await copyModifierToClipboard(view.state, request.pos);
    close();
  };

  const runDelete = () => {
    if (!request) return;
    const { view } = editor;
    if (!getModifierAt(view.state, request.pos)) { close(); return; }
    deleteModifierAt(view.state, (tr) => view.dispatch(tr), request.pos);
    close();
  };

  if (!request) return null;

  const data = getModifierAt(editor.state, request.pos);
  if (!data) return null;

  const placed = placeFloatingNoteUI(
    { left: request.x, right: request.x + 2, top: request.y, bottom: request.y },
    MENU_WIDTH,
    MENU_HEIGHT,
    6,
  );

  const content: ReactNode = mode === 'menu' ? (
    <>
      <MenuAction label="Rinomina" icon={Pencil} onActivate={startRename} />
      <MenuAction label={data.compact ? 'Allarga' : 'Riduci'} icon={data.compact ? Maximize2 : Minimize2} onActivate={() => runCompact(!data.compact)} />
      <MenuAction label="Modifica" icon={Type} onActivate={startEdit} />
      <MenuAction label="Duplica" icon={Copy} onActivate={runDuplicate} />
      <MenuAction label="Copia" icon={Clipboard} onActivate={runCopy} />
      <div className="my-1 h-px bg-[var(--dash-border-soft)]" />
      <MenuAction label="Elimina" icon={Trash2} danger onActivate={runDelete} />
    </>
  ) : (
    <form onSubmit={submit} className="p-1">
      <label htmlFor="note-modifier-input" className="mb-1 block px-0.5 text-[10px] font-semibold uppercase tracking-wider text-[var(--dash-muted)]">
        {mode === 'rename' ? 'Nome' : 'Valore'}
      </label>
      <input
        id="note-modifier-input"
        ref={inputRef}
        value={draft}
        onChange={(event) => setDraft(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === 'Escape') {
            event.preventDefault();
            event.stopPropagation();
            close();
          }
        }}
        placeholder={mode === 'rename' ? MODIFIER_DEFAULT_NAME : '0'}
        className="w-full rounded-md border border-[var(--dash-border-soft)] bg-[var(--dash-surface)] px-2 py-1.5 text-xs text-[var(--dash-text)] outline-none focus:border-[var(--dash-accent)]"
      />
      <div className="mt-1.5 flex gap-1.5">
        <button
          type="submit"
          className="flex-1 rounded-md bg-[var(--dash-accent)] px-2 py-1.5 text-xs font-semibold text-[var(--dash-text-strong)] transition-colors hover:brightness-110"
        >
          Salva
        </button>
        <button
          type="button"
          onClick={close}
          className="flex-1 rounded-md border border-[var(--dash-border-soft)] bg-[var(--dash-surface)] px-2 py-1.5 text-xs text-[var(--dash-text)] transition-colors hover:bg-[var(--dash-surface-2)]"
        >
          Annulla
        </button>
      </div>
    </form>
  );

  const menu = (
    <div
      data-note-contextual-ui="true"
      data-note-modifier-menu="true"
      role="menu"
      aria-label="Menu Modificatore"
      style={{ position: 'fixed', top: placed.top, left: placed.left, zIndex: 9997 }}
      className={`rounded-lg border border-[var(--dash-border-soft)] bg-[var(--dash-panel)] p-1 shadow-lg ${mode === 'menu' ? 'w-[184px]' : 'w-[212px]'}`}
    >
      {content}
    </div>
  );

  return createPortal(menu, portalContainer ?? document.body);
}

// Menu "/" dentro la rinomina del titolo del Modificatore: solo gruppo
// Testo, senza Elenco puntato / Elenco numerato / Citazione. Le voci riusano
// le icone dei comandi nota (stesse regole degli altri menu compatti).
export const TITLE_SLASH_COMMAND_IDS: readonly NoteCommandId[] = [
  'bold', 'italic', 'underline', 'strike', 'fontSize', 'fontFamily',
  'alignLeft', 'alignCenter', 'alignRight',
];

const TITLE_MENU_WIDTH = 224;
const TITLE_MENU_HEIGHT = 320;

interface TitleMenuState extends NoteModifierTitleMenuRequest {}

export function NoteModifierTitleMenu({ editable }: { editable: boolean }) {
  const portalContainer = usePortalContainer();
  const [request, setRequest] = useState<TitleMenuState | null>(null);
  const [highlight, setHighlight] = useState(0);
  const [expanded, setExpanded] = useState<'fontSize' | 'fontFamily' | null>(null);

  useEffect(() => {
    const onOpen = (event: Event) => {
      const detail = (event as CustomEvent<NoteModifierTitleMenuRequest>).detail;
      if (typeof detail?.pos !== 'number') return;
      setRequest({ ...detail });
      setHighlight(0);
    };
    const onClose = (event: Event) => {
      const detail = (event as CustomEvent<{ pos: number }>).detail;
      setRequest((current) => (current && detail && current.pos === detail.pos ? null : current));
      setExpanded(null);
    };
    window.addEventListener(NOTE_MODIFIER_TITLE_MENU_EVENT, onOpen);
    window.addEventListener(NOTE_MODIFIER_TITLE_MENU_CLOSE_EVENT, onClose);
    return () => {
      window.removeEventListener(NOTE_MODIFIER_TITLE_MENU_EVENT, onOpen);
      window.removeEventListener(NOTE_MODIFIER_TITLE_MENU_CLOSE_EVENT, onClose);
    };
  }, []);

  const commands = useMemo(
    () => TITLE_SLASH_COMMAND_IDS
      .map((id) => NOTE_COMMANDS.find((command) => command.id === id))
      .filter((command): command is (typeof NOTE_COMMANDS)[number] => Boolean(command)),
    [],
  );

  const filtered = useMemo(() => {
    const query = (request?.query ?? '').trim().toLowerCase();
    if (!query) return commands;
    return commands.filter((command) => command.label.toLowerCase().includes(query));
  }, [commands, request]);

  useEffect(() => {
    setHighlight(0);
    setExpanded(null);
  }, [request?.query]);

  const apply = useCallback((commandId: NoteCommandId, value?: number | string) => {
    if (!request) return;
    const formatCommand: ModifierTitleFormatCommand | null =
      commandId === 'bold' ? 'bold'
      : commandId === 'italic' ? 'italic'
      : commandId === 'underline' ? 'underline'
      : commandId === 'strike' ? 'strike'
      : commandId === 'fontSize' ? 'fontSize'
      : commandId === 'fontFamily' ? 'fontFamily'
      : commandId === 'alignLeft' ? 'alignLeft'
      : commandId === 'alignCenter' ? 'alignCenter'
      : commandId === 'alignRight' ? 'alignRight'
      : null;
    if (!formatCommand) return;
    const detail: NoteModifierTitleFormatRequest = value === undefined
      ? { pos: request.pos, command: formatCommand }
      : { pos: request.pos, command: formatCommand, value };
    window.dispatchEvent(new CustomEvent(NOTE_MODIFIER_TITLE_FORMAT_EVENT, { detail }));
  }, [request]);

  const dismiss = useCallback(() => {
    if (!request) return;
    window.dispatchEvent(new CustomEvent(NOTE_MODIFIER_TITLE_MENU_DISMISS_EVENT, { detail: { pos: request.pos } }));
    setRequest(null);
    setExpanded(null);
  }, [request]);

  // Tastiera del menu titolo: frecce navigano, Invio applica, Escape chiude
  // ("/" resta testo, come lo slash menu dell'editor). Capture su window per
  // arrivare prima dei listener dell'editor.
  useEffect(() => {
    if (!request || !editable) return;
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as Element | null;
      if (!target?.closest?.('[data-note-modifier-rename="true"]')) return;
      const consume = () => {
        event.preventDefault();
        event.stopPropagation();
        if (typeof event.stopImmediatePropagation === 'function') event.stopImmediatePropagation();
      };
      if (event.key === 'Escape') {
        consume();
        if (expanded) setExpanded(null);
        else dismiss();
        return;
      }
      if (expanded === 'fontSize') {
        if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
          consume();
          setHighlight((current) => {
            const delta = event.key === 'ArrowDown' ? 1 : -1;
            return (current + delta + FONT_SIZES.length) % FONT_SIZES.length;
          });
        } else if (event.key === 'Enter') {
          consume();
          apply('fontSize', FONT_SIZES[highlight % FONT_SIZES.length]);
        }
        return;
      }
      if (expanded === 'fontFamily') {
        if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
          consume();
          setHighlight((current) => {
            const delta = event.key === 'ArrowDown' ? 1 : -1;
            return (current + delta + FONT_FAMILIES.length) % FONT_FAMILIES.length;
          });
        } else if (event.key === 'Enter') {
          consume();
          apply('fontFamily', FONT_FAMILIES[highlight % FONT_FAMILIES.length].label);
        }
        return;
      }
      if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
        consume();
        if (!filtered.length) return;
        setHighlight((current) => {
          const delta = event.key === 'ArrowDown' ? 1 : -1;
          return (current + delta + filtered.length) % filtered.length;
        });
      } else if (event.key === 'Enter') {
        const command = filtered[highlight];
        if (!command) return;
        consume();
        if (command.id === 'fontSize' || command.id === 'fontFamily') setExpanded(command.id);
        else apply(command.id);
      }
    };
    window.addEventListener('keydown', onKeyDown, true);
    return () => window.removeEventListener('keydown', onKeyDown, true);
  }, [request, editable, filtered, highlight, expanded, apply, dismiss]);

  if (!editable || !request) return null;

  const placed = placeFloatingNoteUI(
    { left: request.x, right: request.x + 2, top: request.y, bottom: request.y },
    TITLE_MENU_WIDTH,
    TITLE_MENU_HEIGHT,
    6,
  );

  const renderMainButton = (command: (typeof NOTE_COMMANDS)[number], index: number) => {
    const Icon = command.icon;
    const active = index === highlight && !expanded;
    return (
      <button
        key={command.id}
        type="button"
        role="menuitem"
        aria-label={command.label}
        onMouseDown={(event) => event.preventDefault()}
        onClick={(event) => {
          event.preventDefault();
          if (command.id === 'fontSize' || command.id === 'fontFamily') {
            setExpanded(command.id);
            setHighlight(0);
          } else {
            apply(command.id);
          }
        }}
        onMouseEnter={() => { setHighlight(index); }}
        className={`flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-left text-xs transition-colors ${
          active
            ? 'bg-[var(--dash-accent)] text-[var(--dash-text-strong)]'
            : 'text-[var(--dash-text)] hover:bg-[var(--dash-accent)] hover:text-[var(--dash-text-strong)]'
        }`}
      >
        <Icon className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
        <span className="truncate">{command.label}</span>
      </button>
    );
  };

  const secondary = expanded === 'fontSize' ? (
    <div className="p-1">
      <button
        type="button"
        onMouseDown={(event) => event.preventDefault()}
        onClick={() => { setExpanded(null); setHighlight(0); }}
        className="mb-1 flex w-full items-center gap-1.5 rounded-md px-2 py-1 text-left text-[11px] text-[var(--dash-muted)] hover:bg-[var(--dash-surface-2)]"
      >
        <ArrowLeft className="h-3 w-3" aria-hidden="true" /> Formato titolo
      </button>
      <div className="grid grid-cols-3 gap-1">
        {FONT_SIZES.map((size, index) => (
          <button
            key={size}
            type="button"
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => apply('fontSize', size)}
            onMouseEnter={() => setHighlight(index)}
            className={`rounded-md px-2 py-1.5 text-sm ${index === highlight % FONT_SIZES.length ? 'bg-[var(--dash-accent)] text-[var(--dash-text-strong)]' : 'hover:bg-[var(--dash-surface-2)]'}`}
          >
            {size}
          </button>
        ))}
      </div>
    </div>
  ) : expanded === 'fontFamily' ? (
    <div className="p-1">
      <button
        type="button"
        onMouseDown={(event) => event.preventDefault()}
        onClick={() => { setExpanded(null); setHighlight(0); }}
        className="mb-1 flex w-full items-center gap-1.5 rounded-md px-2 py-1 text-left text-[11px] text-[var(--dash-muted)] hover:bg-[var(--dash-surface-2)]"
      >
        <ArrowLeft className="h-3 w-3" aria-hidden="true" /> Formato titolo
      </button>
      <div className="flex max-h-56 flex-col gap-0.5 overflow-y-auto pr-1">
        {FONT_FAMILIES.map(({ label, value }, index) => (
          <button
            key={label}
            type="button"
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => apply('fontFamily', label)}
            onMouseEnter={() => setHighlight(index)}
            style={{ fontFamily: value }}
            className={`rounded-md px-2 py-1.5 text-left text-sm ${index === highlight % FONT_FAMILIES.length ? 'bg-[var(--dash-accent)] text-[var(--dash-text-strong)]' : 'hover:bg-[var(--dash-surface-2)]'}`}
          >
            {label}
          </button>
        ))}
      </div>
    </div>
  ) : null;

  const menu = (
    <div
      data-note-contextual-ui="true"
      data-note-modifier-title-menu="true"
      role="menu"
      aria-label="Formato titolo"
      style={{ position: 'fixed', top: placed.top, left: placed.left, zIndex: 9998 }}
      className="w-[224px] overflow-hidden rounded-lg border border-[var(--dash-border-soft)] bg-[var(--dash-panel)] p-1 shadow-lg"
      onPointerDown={(event) => event.stopPropagation()}
    >
      <div className="border-b border-[var(--dash-border-soft)] bg-[var(--dash-surface-2)] px-2 py-1.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-[var(--dash-text-strong)]">
        Testo
      </div>
      {secondary ?? (
        <div className="p-1">
          {filtered.length ? filtered.map((command, index) => renderMainButton(command, index)) : (
            <div className="px-2 py-3 text-center text-xs text-[var(--dash-muted)]">Nessun formato trovato</div>
          )}
        </div>
      )}
    </div>
  );

  return createPortal(menu, portalContainer ?? document.body);
}
