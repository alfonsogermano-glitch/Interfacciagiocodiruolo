import { useCallback, useEffect, useLayoutEffect, useRef, useState, type ReactNode, type RefObject } from 'react';
import { useEditor, EditorContent, type Editor } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import type { JSONContent } from '@tiptap/core';
import TextAlign from '@tiptap/extension-text-align';
import Image from '@tiptap/extension-image';
import TaskList from '@tiptap/extension-task-list';
import TaskItem from '@tiptap/extension-task-item';
import { useClaimNoteUndoScope } from './noteUndoScope';
import { MarkdownContent } from './MarkdownContent';
import { parseLines } from './markdownHeadings';
import { TIPTAP_BLOCK_EXTENSIONS } from './tiptapBlocks';
import { FontSize, HEADING_LEVEL_TO_FONT_SIZE, migrateHeadingsToFontSize } from './tiptapFontSize';
import { FontFamily } from './tiptapFontFamily';
import { InlineIcon } from './tiptapInlineIcon';
import { InlineModifier, collectModifiersFromJSON, publishModifierPeers, unpublishModifierPeers } from './tiptapInlineModifier';
import { InlineDice } from './tiptapInlineDice';
import { InlinePoints } from './tiptapInlinePoints';
import { InlineCheckbox } from './tiptapInlineCheckbox';
import { NOTE_TABLE_EXTENSIONS } from './tiptapNoteTable';
import { Archivio } from './tiptapArchivio';
import { NoteTableClipboardPaste } from './noteTableClipboard';
import { NoteRichClipboard } from './tiptapNoteRichClipboard';
import { NoteContainerGuard } from './tiptapNoteContainerGuard';
import { NoteSlashMenuExtension } from './tiptapNoteSlashMenu';
import { NoteTableToolbar } from './NoteTableToolbar';
import { NoteRowGutter } from './NoteRowGutter';
import { NoteSlashMenu } from './NoteSlashMenu';
import { NoteDiceMenu, NoteModifierMenu, NoteModifierRollBridge, NoteModifierTitleMenu } from './NoteModifierMenu';
import { NotePointsMenu } from './NotePointsMenu';
import { NoteSelectionToolbar } from './NoteSelectionToolbar';
import { NoteContainerNotice } from './NoteContainerNotice';
import { flattenRemovedLayoutNodes } from './tiptapLegacyMigration';
import type { NoteContainerRejection } from './noteContainerPolicy';
import './noteEditorViewport.css';

interface RichTextEditorProps {
  legacyContent: string;
  richContent: JSONContent | null;
  onChangeRich: (json: JSONContent) => void;
  disabled: boolean;
  placeholder?: string;
  className?: string;
  fillViewport?: boolean;
  autoFocusOnSelect?: boolean;
  onAutoFocusConsumed?: () => void;
  /** Documenti delle altre tab della stessa nota: i Modificatori referenziabili
   *  dalle formule vivono anche li' (la lista nomi e la risoluzione li usano). */
  peerContents?: Array<JSONContent | null>;
}

function legacyToTipTapDoc(content: string): JSONContent {
  const lines = parseLines(content);
  return {
    type: 'doc',
    content: lines.map((line) => ({
      type: 'paragraph',
      content: line.text
        ? [{ type: 'text', text: line.text, ...(line.level !== 0 ? { marks: [{ type: 'fontSize', attrs: { size: HEADING_LEVEL_TO_FONT_SIZE[line.level] } }] } : {}) }]
        : [],
    })),
  };
}

function docText(doc: JSONContent | null | undefined): string {
  if (!doc) return '';
  const walk = (node: JSONContent): string => {
    let out = node.text ?? '';
    if (node.content) out += node.content.map(walk).join(node.type === 'doc' ? '\n' : '');
    return out;
  };
  return walk(doc);
}

function isDocEmpty(doc: JSONContent | null | undefined): boolean {
  return docText(doc).trim() === '';
}

function canonicalizeNoteJSON(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalizeNoteJSON);
  if (value && typeof value === 'object') {
    const source = value as Record<string, unknown>;
    const out: Record<string, unknown> = {};
    for (const key of Object.keys(source).sort()) {
      // ProseMirror omette i content vuoti nel toJSON (es. collapseSummary):
      // un content assente e un content [] sono lo stesso documento.
      if (key === 'content' && Array.isArray(source[key]) && (source[key] as unknown[]).length === 0) continue;
      out[key] = canonicalizeNoteJSON(source[key]);
    }
    return out;
  }
  return value;
}

// Confronto canonico: l'ordine delle chiavi (es. riscrittura jsonb di
// Supabase: text prima di type) e i content vuoti non sono differenze di
// contenuto. Senza questo, ogni eco dal server risultava "diverso" e
// scattava un setContent che azzerava menu slash, selezione e posizioni.
function docsEqual(a: JSONContent | null | undefined, b: JSONContent | null | undefined): boolean {
  return JSON.stringify(canonicalizeNoteJSON(a)) === JSON.stringify(canonicalizeNoteJSON(b));
}

const TIPTAP_EDITOR_PROPS = { attributes: { class: 'tiptap-content' } };
const NOTE_VIEWPORT_MIN_HEIGHT = 256;

function useViewportFillHeight(ref: RefObject<HTMLDivElement | null>, enabled: boolean): number | null {
  const [height, setHeight] = useState<number | null>(null);

  useLayoutEffect(() => {
    if (!enabled) {
      setHeight(null);
      return;
    }

    let frame = 0;
    const update = () => {
      const node = ref.current;
      if (!node) return;
      const viewportHeight = window.visualViewport?.height ?? window.innerHeight;
      const top = node.getBoundingClientRect().top;
      const next = Math.max(NOTE_VIEWPORT_MIN_HEIGHT, Math.floor(viewportHeight - top));
      setHeight((current) => current === next ? current : next);
    };
    const scheduleUpdate = () => {
      window.cancelAnimationFrame(frame);
      frame = window.requestAnimationFrame(update);
    };

    update();
    const resizeObserver = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(scheduleUpdate);
    if (ref.current?.parentElement) resizeObserver?.observe(ref.current.parentElement);
    window.addEventListener('resize', scheduleUpdate);
    window.visualViewport?.addEventListener('resize', scheduleUpdate);
    return () => {
      window.cancelAnimationFrame(frame);
      resizeObserver?.disconnect();
      window.removeEventListener('resize', scheduleUpdate);
      window.visualViewport?.removeEventListener('resize', scheduleUpdate);
    };
  }, [enabled, ref]);

  return height;
}

function NoteViewportFrame({ enabled, children }: { enabled: boolean; children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const height = useViewportFillHeight(ref, enabled);
  if (!enabled) return <>{children}</>;
  return (
    <div
      ref={ref}
      data-note-viewport-fill="true"
      className="min-h-[16rem] max-w-full"
      style={height === null ? undefined : { height: `${height}px` }}
    >
      {children}
    </div>
  );
}

function TipTapEditor({ richContent, onChangeRich, editable, canToggleInlineCheckbox, autoFocus, onBlurEditor, onClickText, containerClassName, fillViewport, peerContents }: {
  richContent: JSONContent;
  onChangeRich: (json: JSONContent) => void;
  editable: boolean;
  canToggleInlineCheckbox: boolean;
  autoFocus: boolean;
  onBlurEditor?: () => void;
  onClickText?: () => void;
  containerClassName: string;
  fillViewport: boolean;
  peerContents?: Array<JSONContent | null>;
}) {
  const [initialContent] = useState(() => flattenRemovedLayoutNodes(migrateHeadingsToFontSize(richContent)));
  const editorShellRef = useRef<HTMLDivElement>(null);
  const [containerRejection, setContainerRejection] = useState<NoteContainerRejection | null>(null);
  const rejectionCallbackRef = useRef<(reason: NoteContainerRejection) => void>(() => {});
  rejectionCallbackRef.current = (reason) => {
    if (editable) setContainerRejection(reason);
  };
  const onReject = useCallback((reason: NoteContainerRejection) => rejectionCallbackRef.current(reason), []);

  const canToggleInlineCheckboxRef = useRef(canToggleInlineCheckbox);
  canToggleInlineCheckboxRef.current = canToggleInlineCheckbox;
  const [inlineCheckboxExtension] = useState(() => InlineCheckbox.configure({
    canToggle: () => canToggleInlineCheckboxRef.current,
  }));
  const [containerGuardExtension] = useState(() => NoteContainerGuard.configure({ onReject }));
  const [tableClipboardExtension] = useState(() => NoteTableClipboardPaste.configure({ onReject }));
  const [richClipboardExtension] = useState(() => NoteRichClipboard.configure({ onReject }));

  const editor = useEditor({
    extensions: [
      StarterKit.configure({ heading: false }),
      FontSize,
      FontFamily,
      TextAlign.configure({ types: ['paragraph'] }),
      Image,
      TaskList,
      TaskItem.configure({ nested: false }),
      InlineIcon,
      InlineModifier,
      InlineDice,
      InlinePoints,
      inlineCheckboxExtension,
      ...TIPTAP_BLOCK_EXTENSIONS,
      ...NOTE_TABLE_EXTENSIONS,
      Archivio,
      containerGuardExtension,
      tableClipboardExtension,
      richClipboardExtension,
      NoteSlashMenuExtension,
    ],
    content: initialContent,
    editable,
    editorProps: TIPTAP_EDITOR_PROPS,
    onUpdate: ({ editor }) => onChangeRich(editor.getJSON()),
    onBlur: ({ event }) => {
      const related = event.relatedTarget as Node | null;
      if (editorShellRef.current?.contains(related)) return;
      if (related instanceof Element && related.closest('[data-note-contextual-ui="true"]')) return;
      if (related instanceof Element && related.closest('[data-slot="popover-content"]')) return;
      // Il blur vero (click fuori su area vuota) deve spegnere anche un'eventuale
      // DOM selection orfana rimasta nel shell: senza questo resta un caret
      // fantasma visibile mentre l'editor e' gia' non editable. Il nuovo campo
      // (se ce n'e' uno) imposta da solo il proprio caret al focus.
      const domSelection = window.getSelection();
      if (domSelection && domSelection.rangeCount > 0 && editorShellRef.current?.contains(domSelection.anchorNode)) {
        domSelection.removeAllRanges();
      }
      onBlurEditor?.();
    },
  });

  // Rivendica l'ambito Annulla della barra tab con l'istanza viva (vedi
  // noteUndoScope.tsx): il tasto nella EntityTabBar agisce su questo editor.
  useClaimNoteUndoScope(editor);

  useEffect(() => {
    if (!containerRejection) return;
    const timer = window.setTimeout(() => setContainerRejection(null), 2800);
    return () => window.clearTimeout(timer);
  }, [containerRejection]);

  useEffect(() => {
    if (!editor) return;
    editor.setEditable(editable);
  }, [editor, editable]);

  // Pubblica i Modificatori delle altre tab per riferimenti/tooltip/rosso dei
  // widget; al cambio peer rinfresca la vista solo a editor sfocato (mentre si
  // digita le transazioni ricostruiscono gia' tutto, e si evita l'IME).
  useEffect(() => {
    if (!editor) return;
    publishModifierPeers(
      editor.view,
      (peerContents ?? []).flatMap((peer) => collectModifiersFromJSON(peer)),
    );
    if (!editor.view.hasFocus()) editor.view.updateState(editor.state);
    return () => { unpublishModifierPeers(editor.view); };
  }, [editor, peerContents]);

  useEffect(() => {
    if (!editor) return;
    if (editable && autoFocus) editor.commands.focus();
  }, [editor, editable, autoFocus]);

  useEffect(() => {
    if (!editor) return;
    const migratedRichContent = flattenRemovedLayoutNodes(migrateHeadingsToFontSize(richContent));
    if (docsEqual(migratedRichContent, editor.getJSON())) return;
    if (typeof console !== 'undefined') {
      const a = JSON.stringify(migratedRichContent) ?? '';
      const b = JSON.stringify(editor.getJSON()) ?? '';
      let firstDiff = -1;
      for (let i = 0; i < Math.min(a.length, b.length); i += 1) {
        if (a[i] !== b[i]) { firstDiff = i; break; }
      }
      console.info(`[SlashTrace] setContent esterno: prop(${a.length}) vs editor(${b.length}), prima diff a ${firstDiff}`);
      console.info(`[SlashTrace] prop: ...${a.slice(Math.max(0, firstDiff - 60), firstDiff + 100)}...`);
      console.info(`[SlashTrace] editor: ...${b.slice(Math.max(0, firstDiff - 60), firstDiff + 100)}...`);
    }
    if (isDocEmpty(migratedRichContent) && !isDocEmpty(editor.getJSON())) return;
    const { from, to } = editor.state.selection;
    // Il contenuto esterno (seed iniziale della tab, sync da broadcast) non
    // e' un'azione dell'utente: senza questa meta la transazione di
    // setContent finiva nello history di ProseMirror e il tasto Annulla si
    // accendeva su una tab appena creata e vuota ("non ho scritto nulla") -
    // annullare avrebbe per di piu' riportato il doc al contenitore vuoto di
    // partenza. tiptap v3 (UndoRedo) non espone clearHistory, quindi si
    // marca la transazione con addToHistory:false, la meta documentata di
    // prosemirror-history ("prevent it from being rolled back by undo");
    // setContent lavora sul tr condiviso della chain, quindi la meta resta
    // sulla stessa transazione del replace. Le digitazioni dell'utente non
    // passano da qui (docsEqual sopra le fa uscire in anticipo) e restano
    // normalmente annullabili.
    editor.chain()
      .command(({ tr }) => {
        tr.setMeta('addToHistory', false);
        return true;
      })
      .setContent(migratedRichContent, { emitUpdate: false })
      .run();
    const max = editor.state.doc.content.size;
    const nextFrom = Math.max(0, Math.min(from, max));
    const nextTo = Math.max(nextFrom, Math.min(to, max));
    try { editor.commands.setTextSelection({ from: nextFrom, to: nextTo }); } catch { editor.commands.focus('end'); }
  }, [editor, richContent]);

  if (!editor) return null;

  return (
    <div ref={editorShellRef} className={`group relative max-w-full ${fillViewport ? 'h-full' : ''}`}>
      <div
        onClick={!editable ? onClickText : undefined}
        onMouseDown={editable ? (event) => {
          // Click sul padding/area vuota del contenitore (non sul testo):
          // senza questo il mousedown sposta il focus fuori, l'editor fa blur
          // e il mouseup lo riattiva - caret e undo lampeggiano a ogni click e
          // restano nascosti finche' il tasto resta premuto. Bloccando il
          // default il focus resta dentro e niente lampeggia. Mai sul testo
          // (serve a ProseMirror) ne' sulle scrollbar (serve allo scroll).
          if (event.target !== event.currentTarget) return;
          const box = event.currentTarget.getBoundingClientRect();
          if (event.clientX - box.left >= event.currentTarget.clientWidth) return;
          if (event.clientY - box.top >= event.currentTarget.clientHeight) return;
          event.preventDefault();
        } : undefined}
        style={fillViewport ? { height: '100%' } : undefined}
        className={`max-w-full ${fillViewport ? 'h-full overflow-auto tiptap-viewport-scroll' : 'overflow-x-auto'} ${!editable && onClickText ? 'cursor-text' : ''} ${containerClassName}`}
      >
        <EditorContent editor={editor} />
      </div>
      <NoteRowGutter editor={editor} editable={editable} shellRef={editorShellRef} />
      <NoteSlashMenu editor={editor} editable={editable} />
      <NoteModifierMenu editor={editor} editable={editable} />
      <NoteDiceMenu editor={editor} editable={editable} canPersist={canToggleInlineCheckbox} />
      <NotePointsMenu editor={editor} editable={editable} />
      <NoteModifierTitleMenu editable={editable} />
      <NoteModifierRollBridge editor={editor} />
      <NoteSelectionToolbar editor={editor} editable={editable} />
      <NoteTableToolbar editor={editor} editable={editable} />
      <NoteContainerNotice reason={containerRejection} anchor={editorShellRef.current} />
    </div>
  );
}

const DEFAULT_CONTAINER_CLASS = 'min-h-[3rem] rounded-xl border border-[var(--dash-border-soft)] bg-[var(--dash-panel)] p-3';

export function RichTextEditor({ legacyContent, richContent, onChangeRich, disabled, placeholder, className, fillViewport = true, autoFocusOnSelect, onAutoFocusConsumed, peerContents }: RichTextEditorProps) {
  const [isEditing, setIsEditing] = useState(() => !!autoFocusOnSelect && !disabled);
  useEffect(() => { if (autoFocusOnSelect) onAutoFocusConsumed?.(); }, []);
  const hasLegacyToProtect = richContent === null && legacyContent.trim() !== '';
  const containerClassName = className ?? DEFAULT_CONTAINER_CLASS;

  if (richContent !== null) {
    return (
      <NoteViewportFrame enabled={fillViewport}>
        <TipTapEditor richContent={richContent} onChangeRich={onChangeRich} editable={!disabled && isEditing} canToggleInlineCheckbox={!disabled} autoFocus={isEditing} onBlurEditor={() => setIsEditing(false)} onClickText={!disabled ? () => setIsEditing(true) : undefined} containerClassName={containerClassName} fillViewport={fillViewport} peerContents={peerContents} />
      </NoteViewportFrame>
    );
  }

  const viewportClassName = fillViewport ? 'h-full overflow-auto tiptap-viewport-scroll' : '';
  const viewBlock = (
    <div onClick={() => { if (!disabled) setIsEditing(true); }} style={fillViewport ? { height: '100%' } : undefined} className={`${!disabled ? 'cursor-text' : ''} ${viewportClassName} ${containerClassName}`}>
      {legacyContent ? <MarkdownContent content={legacyContent} /> : <span className="text-sm text-[var(--dash-muted)]">{placeholder ?? 'Scrivi qui...'}</span>}
    </div>
  );

  if (disabled || !isEditing) return <NoteViewportFrame enabled={fillViewport}>{viewBlock}</NoteViewportFrame>;
  if (hasLegacyToProtect) {
    return (
      <NoteViewportFrame enabled={fillViewport}>
        <div style={fillViewport ? { height: '100%' } : undefined} className={`${viewportClassName} ${containerClassName}`}>
          <div className="mb-2 rounded-lg border border-[var(--dash-accent)]/40 bg-[var(--dash-accent)]/10 px-3 py-2 text-xs text-[var(--dash-text)]">Formato precedente — modifica per aggiornare al nuovo editor.</div>
          <MarkdownContent content={legacyContent} />
          <button type="button" onClick={() => onChangeRich(legacyToTipTapDoc(legacyContent))} className="mt-2 rounded-lg border border-[var(--dash-border-soft)] bg-[var(--dash-surface)] px-3 py-1.5 text-xs font-medium text-[var(--dash-text)] transition-colors hover:bg-[var(--dash-surface-2)]">Modifica con il nuovo editor</button>
        </div>
      </NoteViewportFrame>
    );
  }

  return (
    <NoteViewportFrame enabled={fillViewport}>
        <TipTapEditor richContent={{ type: 'doc', content: [{ type: 'paragraph' }] }} onChangeRich={onChangeRich} editable canToggleInlineCheckbox autoFocus onBlurEditor={() => setIsEditing(false)} containerClassName={containerClassName} fillViewport={fillViewport} peerContents={peerContents} />
    </NoteViewportFrame>
  );
}
