import { useCallback, useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import type { Editor } from '@tiptap/react';
import { Ban, Clipboard, Copy, Eye, EyeOff, Gauge, Pencil, Trash2, Type } from 'lucide-react';
import { usePortalContainer } from '../../ui/portal-container';
import { placeFloatingNoteUI } from './noteFloatingPosition';
import {
  copyPointsToClipboard,
  deletePointsAt,
  duplicatePointsAt,
  getPointsAt,
  NOTE_POINTS_MENU_EVENT,
  NOTE_POINTS_RENAME_EVENT,
  setPointsAttrs,
  type NotePointsMenuRequest,
} from './tiptapInlinePoints';

const ITEM = 'flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-left text-xs text-[var(--dash-text)] transition-colors hover:bg-[var(--dash-accent)] hover:text-[var(--dash-text-strong)]';
const DANGER = 'flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-left text-xs text-[var(--dash-danger-text)] transition-colors hover:bg-[var(--dash-danger-bg)]';

function Action({ label, icon: Icon, onClick, danger = false }: { label: string; icon: typeof Pencil; onClick: () => void; danger?: boolean }) {
  return <button type="button" role="menuitem" aria-label={label} onMouseDown={(event) => event.preventDefault()} onClick={onClick} className={danger ? DANGER : ITEM}>
    <Icon className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
    <span className="truncate">{label}</span>
  </button>;
}

export function NotePointsMenu({ editor, editable }: { editor: Editor; editable: boolean }) {
  const portalContainer = usePortalContainer();
  const [request, setRequest] = useState<NotePointsMenuRequest | null>(null);
  const close = useCallback((focus = true) => { setRequest(null); if (focus && editor.isEditable) editor.commands.focus(); }, [editor]);

  useEffect(() => {
    const open = (event: Event) => setRequest((event as CustomEvent<NotePointsMenuRequest>).detail);
    window.addEventListener(NOTE_POINTS_MENU_EVENT, open);
    return () => window.removeEventListener(NOTE_POINTS_MENU_EVENT, open);
  }, []);
  useEffect(() => {
    if (!request) return;
    const outside = (event: PointerEvent) => {
      const target = event.target as Element | null;
      if (target?.closest('[data-note-points-menu="true"], .tiptap-inline-points-widget')) return;
      close(false);
    };
    const escape = (event: KeyboardEvent) => { if (event.key === 'Escape') { event.preventDefault(); close(); } };
    document.addEventListener('pointerdown', outside, true);
    window.addEventListener('keydown', escape);
    return () => { document.removeEventListener('pointerdown', outside, true); window.removeEventListener('keydown', escape); };
  }, [request, close]);
  useEffect(() => {
    if (!request) return;
    const transaction = () => { if (!getPointsAt(editor.state, request.pos)) close(false); };
    editor.on('transaction', transaction);
    return () => { editor.off('transaction', transaction); };
  }, [editor, request, close]);

  if (!editable || !request) return null;
  const data = getPointsAt(editor.state, request.pos);
  if (!data) return null;
  const mutate = (attrs: Parameters<typeof setPointsAttrs>[3]) => {
    setPointsAttrs(editor.state, (tr) => editor.view.dispatch(tr), request.pos, attrs);
    close();
  };
  const placed = placeFloatingNoteUI({ left: request.x, right: request.x + 2, top: request.y, bottom: request.y }, 224, 272, 6);
  return createPortal(
    <div data-note-contextual-ui="true" data-note-points-menu="true" role="menu" aria-label="Menu Punti" style={{ position: 'fixed', top: placed.top, left: placed.left, zIndex: 9997 }} className="w-56 rounded-lg border border-[var(--dash-border-soft)] bg-[var(--dash-panel)] p-1 shadow-lg">
      <Action label="Rinomina" icon={Pencil} onClick={() => { window.dispatchEvent(new CustomEvent(NOTE_POINTS_RENAME_EVENT, { detail: { pos: request.pos } })); setRequest(null); }} />
      <Action label={data.titleVisible ? 'Nascondi titolo' : 'Mostra titolo'} icon={data.titleVisible ? EyeOff : Type} onClick={() => mutate({ titleVisible: !data.titleVisible })} />
      <Action label={data.barVisible ? 'Nascondi la barra' : 'Mostra la barra'} icon={data.barVisible ? EyeOff : Eye} onClick={() => mutate({ barVisible: !data.barVisible })} />
      <Action label={data.maxEnabled ? 'Disabilita punteggio massimo' : 'Abilita punteggio massimo'} icon={data.maxEnabled ? Ban : Gauge} onClick={() => mutate({ maxEnabled: !data.maxEnabled })} />
      <Action label="Duplica" icon={Copy} onClick={() => { duplicatePointsAt(editor.state, (tr) => editor.view.dispatch(tr), request.pos); close(); }} />
      <Action label="Copia" icon={Clipboard} onClick={async () => { await copyPointsToClipboard(editor.view, request.pos); close(); }} />
      <div className="my-1 h-px bg-[var(--dash-border-soft)]" />
      <Action label="Elimina" icon={Trash2} danger onClick={() => { deletePointsAt(editor.state, (tr) => editor.view.dispatch(tr), request.pos); close(); }} />
    </div>,
    portalContainer ?? document.body,
  );
}
