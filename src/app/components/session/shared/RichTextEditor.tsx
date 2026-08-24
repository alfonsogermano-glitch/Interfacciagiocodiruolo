import { useCallback, useEffect, useLayoutEffect, useRef, useState, type ReactNode, type RefObject } from 'react';
import { useEditor, EditorContent, type Editor } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import type { JSONContent } from '@tiptap/core';
import TextAlign from '@tiptap/extension-text-align';
import Image from '@tiptap/extension-image';
import TaskList from '@tiptap/extension-task-list';
import TaskItem from '@tiptap/extension-task-item';
import { Undo2 } from 'lucide-react';
import { MarkdownContent } from './MarkdownContent';
import { parseLines } from './markdownHeadings';
import { TIPTAP_BLOCK_EXTENSIONS } from './tiptapBlocks';
import { FontSize, HEADING_LEVEL_TO_FONT_SIZE, migrateHeadingsToFontSize } from './tiptapFontSize';
import { FontFamily } from './tiptapFontFamily';
import { InlineIcon } from './tiptapInlineIcon';
import { InlineCheckbox } from './tiptapInlineCheckbox';
import { NOTE_TABLE_EXTENSIONS } from './tiptapNoteTable';
import { NoteTableClipboardPaste } from './noteTableClipboard';
import { NoteRichClipboard } from './tiptapNoteRichClipboard';
import { NoteContainerGuard } from './tiptapNoteContainerGuard';
import { NoteSlashMenuExtension } from './tiptapNoteSlashMenu';
import { NoteTableToolbar } from './NoteTableToolbar';
import { NoteSlashMenu } from './NoteSlashMenu';
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

function docsEqual(a: JSONContent | null | undefined, b: JSONContent | null | undefined): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

const TIPTAP_EDITOR_PROPS = { attributes: { class: 'tiptap-content' } };
const NOTE_VIEWPORT_OVERSCAN = 48;
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
      const next = Math.max(NOTE_VIEWPORT_MIN_HEIGHT, Math.floor(viewportHeight - top + NOTE_VIEWPORT_OVERSCAN));
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

function PermanentUndo({ editor, editable }: { editor: Editor; editable: boolean }) {
  const [, refresh] = useState(0);
  useEffect(() => {
    const onTransaction = () => refresh((value) => value + 1);
    editor.on('transaction', onTransaction);
    return () => { editor.off('transaction', onTransaction); };
  }, [editor]);
  if (!editable) return null;
  const disabled = !editor.can().undo();
  return (
    <button
      type="button"
      data-note-contextual-ui="true"
      aria-label="Annulla"
      disabled={disabled}
      onMouseDown={(event) => event.preventDefault()}
      onClick={() => editor.chain().focus().undo().run()}
      className={`absolute right-2 top-2 z-[20] flex h-8 w-8 items-center justify-center rounded-md border border-[var(--dash-border-soft)] bg-[var(--dash-panel)] text-[var(--dash-muted)] shadow-sm transition-colors hover:bg-[var(--dash-surface-2)] hover:text-[var(--dash-text-strong)] ${disabled ? 'cursor-not-allowed opacity-35' : ''}`}
    >
      <Undo2 className="h-4 w-4" />
    </button>
  );
}

function TipTapEditor({ richContent, onChangeRich, editable, canToggleInlineCheckbox, autoFocus, onBlurEditor, onClickText, containerClassName, fillViewport }: {
  richContent: JSONContent;
  onChangeRich: (json: JSONContent) => void;
  editable: boolean;
  canToggleInlineCheckbox: boolean;
  autoFocus: boolean;
  onBlurEditor?: () => void;
  onClickText?: () => void;
  containerClassName: string;
  fillViewport: boolean;
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
      inlineCheckboxExtension,
      ...TIPTAP_BLOCK_EXTENSIONS,
      ...NOTE_TABLE_EXTENSIONS,
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
      onBlurEditor?.();
    },
  });

  useEffect(() => {
    if (!containerRejection) return;
    const timer = window.setTimeout(() => setContainerRejection(null), 2800);
    return () => window.clearTimeout(timer);
  }, [containerRejection]);

  useEffect(() => {
    if (!editor) return;
    editor.setEditable(editable);
  }, [editor, editable]);

  useEffect(() => {
    if (!editor) return;
    if (editable && autoFocus) editor.commands.focus();
  }, [editor, editable, autoFocus]);

  useEffect(() => {
    if (!editor) return;
    const migratedRichContent = flattenRemovedLayoutNodes(migrateHeadingsToFontSize(richContent));
    if (docsEqual(migratedRichContent, editor.getJSON())) return;
    if (isDocEmpty(migratedRichContent) && !isDocEmpty(editor.getJSON())) return;
    const { from, to } = editor.state.selection;
    editor.commands.setContent(migratedRichContent, { emitUpdate: false });
    const max = editor.state.doc.content.size;
    const nextFrom = Math.max(0, Math.min(from, max));
    const nextTo = Math.max(nextFrom, Math.min(to, max));
    try { editor.commands.setTextSelection({ from: nextFrom, to: nextTo }); } catch { editor.commands.focus('end'); }
  }, [editor, richContent]);

  if (!editor) return null;

  return (
    <div ref={editorShellRef} className={`relative max-w-full ${fillViewport ? 'h-full' : ''}`}>
      <div
        onClick={!editable ? onClickText : undefined}
        style={fillViewport ? { height: '100%' } : undefined}
        className={`max-w-full ${fillViewport ? 'h-full overflow-auto tiptap-viewport-scroll' : 'overflow-x-auto'} ${!editable && onClickText ? 'cursor-text' : ''} ${containerClassName}`}
      >
        <EditorContent editor={editor} />
      </div>
      <PermanentUndo editor={editor} editable={editable} />
      <NoteSlashMenu editor={editor} editable={editable} />
      <NoteSelectionToolbar editor={editor} editable={editable} />
      <NoteTableToolbar editor={editor} editable={editable} />
      <NoteContainerNotice reason={containerRejection} anchor={editorShellRef.current} />
    </div>
  );
}

const DEFAULT_CONTAINER_CLASS = 'min-h-[3rem] rounded-xl border border-[var(--dash-border-soft)] bg-[var(--dash-panel)] p-3';

export function RichTextEditor({ legacyContent, richContent, onChangeRich, disabled, placeholder, className, fillViewport = true, autoFocusOnSelect, onAutoFocusConsumed }: RichTextEditorProps) {
  const [isEditing, setIsEditing] = useState(() => !!autoFocusOnSelect && !disabled);
  useEffect(() => { if (autoFocusOnSelect) onAutoFocusConsumed?.(); }, []);
  const hasLegacyToProtect = richContent === null && legacyContent.trim() !== '';
  const containerClassName = className ?? DEFAULT_CONTAINER_CLASS;

  if (richContent !== null) {
    return (
      <NoteViewportFrame enabled={fillViewport}>
        <TipTapEditor richContent={richContent} onChangeRich={onChangeRich} editable={!disabled && isEditing} canToggleInlineCheckbox={!disabled} autoFocus={isEditing} onBlurEditor={() => setIsEditing(false)} onClickText={!disabled ? () => setIsEditing(true) : undefined} containerClassName={containerClassName} fillViewport={fillViewport} />
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
      <TipTapEditor richContent={{ type: 'doc', content: [{ type: 'paragraph' }] }} onChangeRich={onChangeRich} editable canToggleInlineCheckbox autoFocus onBlurEditor={() => setIsEditing(false)} containerClassName={containerClassName} fillViewport={fillViewport} />
    </NoteViewportFrame>
  );
}
