import { useCallback, useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import type { Editor } from '@tiptap/react';
import { usePortalContainer } from '../../ui/portal-container';
import { placeFloatingNoteUI } from './noteFloatingPosition';
import {
  copyModifierToClipboard,
  deleteModifierAt,
  duplicateModifierAt,
  getModifierAt,
  reduceModifierAt,
  setModifierAttrs,
  MODIFIER_DEFAULT_NAME,
  NOTE_MODIFIER_MENU_EVENT,
  type NoteModifierMenuRequest,
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

function MenuAction({ label, onActivate, danger = false, hint }: { label: string; onActivate: () => void; danger?: boolean; hint?: string }) {
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
    const data = getModifierAt(editor.state, request.pos);
    setDraft(data?.name ?? '');
    setMode('rename');
  };

  const startEdit = () => {
    if (!request) return;
    const data = getModifierAt(editor.state, request.pos);
    setDraft(data?.value ?? '');
    setMode('edit');
  };

  const runReduce = () => {
    if (!request) return;
    const { view } = editor;
    if (!getModifierAt(view.state, request.pos)) { close(); return; }
    reduceModifierAt(view.state, (tr) => view.dispatch(tr), request.pos);
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
      <MenuAction label="Rinomina" onActivate={startRename} />
      <MenuAction label="Riduci" onActivate={runReduce} hint={data.name} />
      <MenuAction label="Modifica" onActivate={startEdit} />
      <MenuAction label="Duplica" onActivate={runDuplicate} />
      <MenuAction label="Copia" onActivate={runCopy} />
      <div className="my-1 h-px bg-[var(--dash-border-soft)]" />
      <MenuAction label="Elimina" danger onActivate={runDelete} />
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