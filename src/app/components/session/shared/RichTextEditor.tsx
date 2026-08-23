import { useEffect, useRef, useState } from 'react';
import { useEditor, EditorContent, type Editor } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import type { JSONContent } from '@tiptap/core';
import { Bold, Italic, List, ListOrdered, ChevronRight, Underline as UnderlineIcon, Strikethrough, Quote, SeparatorHorizontal, Square, ChevronsDownUp, AlignLeft, AlignCenter, AlignRight, Image as ImageIcon, Undo2, Type as FontIcon, Check, PenLine, LayoutTemplate, ListTodo, Shapes, Sword, Swords, Shield, Target, Crosshair, Skull, Bomb, Zap, Flame, Biohazard, Sparkles, Wand, Ghost, Eye, Moon, Sun, Feather, Scroll, Radiation, Snowflake, Compass, Map, MapPin, Mountain, Tent, Footprints, Anchor, Ship, Route, Signpost, User, Users, Crown, GraduationCap, Drama, Briefcase, Key, Gem, Coins, Pickaxe, FlaskConical, Pill, Syringe, Dice6, BookOpen, Castle, Church, Landmark, DoorOpen, Home, Store, Trees, Activity, Bell, Brain, Star, Heart, Music, Theater, Newspaper, type LucideIcon } from 'lucide-react';
import TextAlign from '@tiptap/extension-text-align';
import Image from '@tiptap/extension-image';
import TaskList from '@tiptap/extension-task-list';
import TaskItem from '@tiptap/extension-task-item';
import { MarkdownContent } from './MarkdownContent';
import { parseLines } from './markdownHeadings';
import { TIPTAP_BLOCK_EXTENSIONS } from './tiptapBlocks';
import { FontSize, FONT_SIZES, HEADING_LEVEL_TO_FONT_SIZE, migrateHeadingsToFontSize } from './tiptapFontSize';
import { FontFamily, FONT_FAMILIES } from './tiptapFontFamily';
import { InlineIcon } from './tiptapInlineIcon';
import { InlineCheckbox } from './tiptapInlineCheckbox';
import { ICON_CATEGORIES } from './tiptapIconData';
import { flattenRemovedLayoutNodes } from './tiptapLegacyMigration';
import { Tooltip, TooltipContent, TooltipTrigger } from '../../ui/tooltip';
import { Popover, PopoverContent, PopoverTrigger } from '../../ui/popover';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '../../ui/tabs';
import { Button } from '../../ui/button';
import { Input } from '../../ui/input';
import { useAuth } from '../../../auth/AuthContext';
import { supabase, isSupabaseConfigured } from '../../../../lib/supabaseClient';

const MAX_IMAGE_MB = 5;

interface RichTextEditorProps {
  legacyContent: string;
  richContent: JSONContent | null;
  onChangeRich: (json: JSONContent) => void;
  disabled: boolean;
  placeholder?: string;
  className?: string;
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

const TIPTAP_EDITOR_PROPS = {
  attributes: { class: 'tiptap-content' },
};

function ToolbarButton({ active, disabled, onClick, label, children }: {
  active: boolean; disabled?: boolean; onClick: () => void; label: string; children: React.ReactNode;
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          disabled={disabled}
          onClick={onClick}
          aria-label={label}
          aria-pressed={active}
          className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-md p-1.5 transition-colors ${
            active ? 'bg-[var(--dash-surface-2)] text-[var(--dash-text-strong)]' : 'text-[var(--dash-muted)] hover:bg-[var(--dash-surface-2)] hover:text-[var(--dash-text-strong)]'
          } ${disabled ? 'cursor-not-allowed opacity-40' : ''}`}
        >
          {children}
        </button>
      </TooltipTrigger>
      <TooltipContent side="right">{label}</TooltipContent>
    </Tooltip>
  );
}

function FontSizeSelect({ editor, editable, onCommand }: { editor: Editor; editable: boolean; onCommand: (fn: () => void) => void }) {
  const currentSize = (editor.getAttributes('fontSize').size as number | undefined) ?? 16;
  return (
    <select
      disabled={!editable}
      value={currentSize}
      onMouseDown={(e) => e.stopPropagation()}
      onChange={(e) => {
        const size = Number(e.target.value);
        onCommand(() => editor.chain().focus().setFontSize(size).run());
      }}
      aria-label="Dimensione testo"
      className={`w-full rounded-md border border-[var(--dash-border-soft)] bg-[var(--dash-input)] px-0.5 py-1.5 text-center text-xs text-[var(--dash-text)] ${editable ? '' : 'cursor-not-allowed opacity-40'}`}
    >
      {FONT_SIZES.map((size) => <option key={size} value={size}>{size}</option>)}
    </select>
  );
}

function FontFamilyPicker({ editor, editable, onCommand }: { editor: Editor; editable: boolean; onCommand: (fn: () => void) => void }) {
  const [open, setOpen] = useState(false);
  const currentFamily = editor.getAttributes('fontFamily').family as string | undefined;
  const currentLabel = FONT_FAMILIES.find((f) => f.value === currentFamily)?.label ?? FONT_FAMILIES[0].label;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <Tooltip>
        <TooltipTrigger asChild>
          <span className="inline-flex">
            <PopoverTrigger asChild>
              <button
                type="button"
                disabled={!editable}
                aria-label="Font"
                className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-md p-1.5 transition-colors text-[var(--dash-muted)] hover:bg-[var(--dash-surface-2)] hover:text-[var(--dash-text-strong)] ${!editable ? 'cursor-not-allowed opacity-40' : ''}`}
              >
                <FontIcon className="h-4 w-4" />
              </button>
            </PopoverTrigger>
          </span>
        </TooltipTrigger>
        <TooltipContent side="right">Font</TooltipContent>
      </Tooltip>
      <PopoverContent side="top" align="start" collisionPadding={8} className="tiptap-font-popover w-48 z-[9999] bg-[var(--dash-panel)] text-[var(--dash-text-strong)] border-[var(--dash-border-soft)] p-1" onMouseDown={(e) => e.stopPropagation()}>
        <div className="flex max-h-72 flex-col gap-0.5 overflow-y-auto">
          {FONT_FAMILIES.map(({ label, value }) => {
            const active = label === currentLabel;
            return (
              <button
                key={label}
                type="button"
                onClick={() => {
                  onCommand(() => editor.chain().focus().setFontFamily(label).run());
                  setOpen(false);
                }}
                className={`flex items-center justify-between gap-2 rounded-md border px-2 py-1.5 text-left text-sm transition-colors hover:bg-[var(--dash-surface-2)] ${active ? 'border-[var(--dash-accent)] text-[var(--dash-text-strong)]' : 'border-transparent text-[var(--dash-text)]'}`}
                style={{ fontFamily: value }}
              >
                <span className="truncate">{label}</span>
                {active && <Check className="h-3.5 w-3.5 shrink-0 text-[var(--dash-accent)]" />}
              </button>
            );
          })}
        </div>
      </PopoverContent>
    </Popover>
  );
}

const ICON_COMPONENTS: Record<string, LucideIcon> = {
  Sword, Swords, Shield, Target, Crosshair, Skull, Bomb, Zap, Flame, Biohazard,
  Sparkles, Wand, Ghost, Eye, Moon, Sun, Feather, Scroll, Radiation, Snowflake,
  Compass, Map, MapPin, Mountain, Tent, Footprints, Anchor, Ship, Route, Signpost,
  User, Users, Crown, GraduationCap, Drama, Briefcase,
  Key, Gem, Coins, Pickaxe, FlaskConical, Pill, Syringe, Dice6, BookOpen,
  Castle, Church, Landmark, DoorOpen, Home, Store, Trees,
  Activity, Bell, Brain, Star, Heart, Music, Theater, Newspaper,
};

function IconPicker({ editor, editable, onCommand }: { editor: Editor; editable: boolean; onCommand: (fn: () => void) => void }) {
  const [open, setOpen] = useState(false);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <Tooltip>
        <TooltipTrigger asChild>
          <span className="inline-flex">
            <PopoverTrigger asChild>
              <button
                type="button"
                disabled={!editable}
                aria-label="Icone"
                className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-md p-1.5 transition-colors text-[var(--dash-muted)] hover:bg-[var(--dash-surface-2)] hover:text-[var(--dash-text-strong)] ${!editable ? 'cursor-not-allowed opacity-40' : ''}`}
              >
                <Shapes className="h-4 w-4" />
              </button>
            </PopoverTrigger>
          </span>
        </TooltipTrigger>
        <TooltipContent side="right">Icone</TooltipContent>
      </Tooltip>
      <PopoverContent side="top" align="start" collisionPadding={8} onOpenAutoFocus={(e) => e.preventDefault()} className="tiptap-icon-popover w-64 z-[9999] bg-[var(--dash-panel)] text-[var(--dash-text-strong)] border-[var(--dash-border-soft)] p-2" onMouseDown={(e) => e.stopPropagation()}>
        <div className="tiptap-icon-popover-scroll flex max-h-80 flex-col gap-3 overflow-y-auto">
          {ICON_CATEGORIES.map(({ label, icons }) => (
            <div key={label}>
              <div className="mb-1 px-0.5 text-[10px] font-medium uppercase tracking-wide text-[var(--dash-muted)]">{label}</div>
              <div className="grid grid-cols-6 gap-1">
                {icons.map((name) => {
                  const IconComponent = ICON_COMPONENTS[name];
                  if (!IconComponent) return null;
                  return (
                    <Tooltip key={name}>
                      <TooltipTrigger asChild>
                        <button
                          type="button"
                          onClick={() => {
                            onCommand(() => editor.chain().focus().insertIcon(name).run());
                            setOpen(false);
                          }}
                          className="flex h-8 w-8 items-center justify-center rounded-md text-[var(--dash-text)] transition-colors hover:bg-[var(--dash-surface-2)] hover:text-[var(--dash-text-strong)]"
                        >
                          <IconComponent className="h-4 w-4" />
                        </button>
                      </TooltipTrigger>
                      <TooltipContent side="top" className="z-[10000]">{name}</TooltipContent>
                    </Tooltip>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}

function ToolbarSection({ label, icon, defaultOpen, children }: { label: string; icon: React.ReactNode; defaultOpen: boolean; children: React.ReactNode }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div>
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            type="button"
            onClick={() => setOpen((o) => !o)}
            aria-expanded={open}
            aria-label={label}
            className="flex w-full items-center justify-center gap-0.5 rounded-md px-0.5 py-1.5 text-[var(--dash-muted)] transition-colors hover:bg-[var(--dash-surface-2)] hover:text-[var(--dash-text-strong)]"
          >
            {icon}
            <ChevronRight className={`h-3 w-3 shrink-0 transition-transform ${open ? 'rotate-90' : ''}`} />
          </button>
        </TooltipTrigger>
        <TooltipContent side="right">{label}</TooltipContent>
      </Tooltip>
      {open && <div className="mt-1 flex flex-col gap-1">{children}</div>}
    </div>
  );
}

function Toolbar({ editor, editable }: { editor: Editor; editable: boolean }) {
  const [, forceRerender] = useState(0);
  const runCommand = (fn: () => void) => {
    fn();
    forceRerender((n) => n + 1);
  };

  const boldActive = editor.isActive('bold');
  const [imagePopoverOpen, setImagePopoverOpen] = useState(false);
  const [imageUrlDraft, setImageUrlDraft] = useState('');
  const insertImageFromUrl = () => {
    const url = imageUrlDraft.trim();
    if (!url) return;
    runCommand(() => editor.chain().focus().setImage({ src: url }).run());
    setImageUrlDraft('');
    setImagePopoverOpen(false);
  };

  const { user } = useAuth();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isUploadingImage, setIsUploadingImage] = useState(false);
  const handleFileSelected = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      window.alert('Seleziona un file immagine.');
      event.target.value = '';
      return;
    }
    if (file.size > MAX_IMAGE_MB * 1024 * 1024) {
      window.alert(`L'immagine non può superare i ${MAX_IMAGE_MB} MB.`);
      event.target.value = '';
      return;
    }
    if (!isSupabaseConfigured || !supabase || !user) {
      window.alert('Caricamento immagine non disponibile: utente non autenticato.');
      event.target.value = '';
      return;
    }
    setIsUploadingImage(true);
    try {
      const ext = file.name.split('.').pop() ?? 'jpg';
      const path = `${user.id}/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;
      const { error: uploadError } = await supabase.storage.from('note-images').upload(path, file);
      if (uploadError) throw uploadError;
      const { data: { publicUrl } } = supabase.storage.from('note-images').getPublicUrl(path);
      runCommand(() => editor.chain().focus().setImage({ src: publicUrl }).run());
    } catch (err) {
      console.log('Errore upload immagine nota:', err);
      window.alert('Caricamento immagine non riuscito. Riprova.');
    } finally {
      setIsUploadingImage(false);
      event.target.value = '';
    }
  };

  return (
    <div onMouseDown={(e) => e.preventDefault()} className="tiptap-toolbar flex w-11 shrink-0 flex-col gap-2">
      <ToolbarSection label="Formattazione testo" icon={<PenLine className="h-4 w-4" />} defaultOpen>
        <ToolbarButton disabled={!editable} label="Grassetto" active={boldActive} onClick={() => runCommand(() => editor.chain().focus().toggleBold().run())}><Bold className="h-4 w-4" /></ToolbarButton>
        <ToolbarButton disabled={!editable} label="Corsivo" active={editor.isActive('italic')} onClick={() => runCommand(() => editor.chain().focus().toggleItalic().run())}><Italic className="h-4 w-4" /></ToolbarButton>
        <ToolbarButton disabled={!editable} label="Sottolineato" active={editor.isActive('underline')} onClick={() => runCommand(() => editor.chain().focus().toggleUnderline().run())}><UnderlineIcon className="h-4 w-4" /></ToolbarButton>
        <ToolbarButton disabled={!editable} label="Sbarrato" active={editor.isActive('strike')} onClick={() => runCommand(() => editor.chain().focus().toggleStrike().run())}><Strikethrough className="h-4 w-4" /></ToolbarButton>
        <FontSizeSelect editor={editor} editable={editable} onCommand={runCommand} />
        <FontFamilyPicker editor={editor} editable={editable} onCommand={runCommand} />
        <ToolbarButton disabled={!editable} label="Elenco puntato" active={editor.isActive('bulletList')} onClick={() => runCommand(() => editor.chain().focus().toggleBulletList().run())}><List className="h-4 w-4" /></ToolbarButton>
        <ToolbarButton disabled={!editable} label="Elenco numerato" active={editor.isActive('orderedList')} onClick={() => runCommand(() => editor.chain().focus().toggleOrderedList().run())}><ListOrdered className="h-4 w-4" /></ToolbarButton>
        <ToolbarButton disabled={!editable} label="Citazione" active={editor.isActive('blockquote')} onClick={() => runCommand(() => editor.chain().focus().toggleBlockquote().run())}><Quote className="h-4 w-4" /></ToolbarButton>
        <ToolbarButton disabled={!editable} label="Allinea a sinistra" active={editor.isActive({ textAlign: 'left' })} onClick={() => runCommand(() => editor.chain().focus().setTextAlign('left').run())}><AlignLeft className="h-4 w-4" /></ToolbarButton>
        <ToolbarButton disabled={!editable} label="Allinea al centro" active={editor.isActive({ textAlign: 'center' })} onClick={() => runCommand(() => editor.chain().focus().setTextAlign('center').run())}><AlignCenter className="h-4 w-4" /></ToolbarButton>
        <ToolbarButton disabled={!editable} label="Allinea a destra" active={editor.isActive({ textAlign: 'right' })} onClick={() => runCommand(() => editor.chain().focus().setTextAlign('right').run())}><AlignRight className="h-4 w-4" /></ToolbarButton>
      </ToolbarSection>

      <ToolbarSection label="Blocchi" icon={<LayoutTemplate className="h-4 w-4" />} defaultOpen>
        <ToolbarButton disabled={!editable} label="Box di testo" active={false} onClick={() => runCommand(() => editor.chain().focus().setTextBox().run())}><Square className="h-4 w-4" /></ToolbarButton>
        <ToolbarButton disabled={!editable} label="Collapse (espandi/comprimi)" active={false} onClick={() => runCommand(() => editor.chain().focus().setCollapseBlock().run())}><ChevronsDownUp className="h-4 w-4" /></ToolbarButton>
        <ToolbarButton disabled={!editable} label="Linea orizzontale" active={false} onClick={() => runCommand(() => editor.chain().focus().setHorizontalRule().run())}><SeparatorHorizontal className="h-4 w-4" /></ToolbarButton>
        <ToolbarButton disabled={!editable} label="Attività" active={editor.isActive('taskList')} onClick={() => runCommand(() => editor.chain().focus().toggleTaskList().run())}><ListTodo className="h-4 w-4" /></ToolbarButton>
        <ToolbarButton disabled={!editable} label="Checkbox" active={false} onClick={() => runCommand(() => editor.chain().focus().insertInlineCheckbox().run())}>
          <span className="relative block h-4 w-4">
            <Square className="absolute inset-0 h-4 w-4" />
            <Check className="absolute left-[3px] top-[3px] h-2.5 w-2.5" />
          </span>
        </ToolbarButton>
        <IconPicker editor={editor} editable={editable} onCommand={runCommand} />
        <Popover open={imagePopoverOpen} onOpenChange={setImagePopoverOpen}>
          <Tooltip>
            <TooltipTrigger asChild>
              <span className="inline-flex">
                <PopoverTrigger asChild>
                  <button type="button" disabled={!editable} aria-label="Immagine" className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-md p-1.5 transition-colors text-[var(--dash-muted)] hover:bg-[var(--dash-surface-2)] hover:text-[var(--dash-text-strong)] ${!editable ? 'cursor-not-allowed opacity-40' : ''}`}>
                    <ImageIcon className="h-4 w-4" />
                  </button>
                </PopoverTrigger>
              </span>
            </TooltipTrigger>
            <TooltipContent side="right">Immagine</TooltipContent>
          </Tooltip>
          <PopoverContent side="top" align="start" collisionPadding={8} className="tiptap-image-popover w-64 z-[9999] bg-[var(--dash-panel)] text-[var(--dash-text-strong)] border-[var(--dash-border-soft)]" onMouseDown={(e) => e.stopPropagation()}>
            <Tabs defaultValue="url" className="gap-3">
              <TabsList className="w-full border border-[var(--dash-border-soft)] bg-[var(--dash-surface)]">
                <TabsTrigger value="url" className="text-[var(--dash-muted)] data-[state=active]:bg-[var(--dash-accent)] data-[state=active]:text-[var(--dash-text-strong)]">Da URL</TabsTrigger>
                <TabsTrigger value="file" className="text-[var(--dash-muted)] data-[state=active]:bg-[var(--dash-accent)] data-[state=active]:text-[var(--dash-text-strong)]">Da file</TabsTrigger>
              </TabsList>
              <TabsContent value="url" className="flex flex-col gap-2 min-h-[76px]">
                <Input type="url" placeholder="https://…" value={imageUrlDraft} onChange={(e) => setImageUrlDraft(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); insertImageFromUrl(); } }} className="border-[var(--dash-border-soft)] bg-[var(--dash-input)] text-[var(--dash-text)] placeholder:text-[var(--dash-muted)]" />
                <Button type="button" size="sm" disabled={!imageUrlDraft.trim()} onClick={insertImageFromUrl} className="bg-[var(--dash-accent)] text-[var(--dash-text-strong)] hover:bg-[var(--dash-accent-2)]">Inserisci</Button>
              </TabsContent>
              <TabsContent value="file" className="flex flex-col gap-2 min-h-[76px]">
                <p className="text-xs text-[var(--dash-muted)]">Carica un'immagine dal tuo dispositivo.</p>
                <Button type="button" size="sm" disabled={isUploadingImage} onClick={() => { setImagePopoverOpen(false); fileInputRef.current?.click(); }} className="bg-[var(--dash-accent)] text-[var(--dash-text-strong)] hover:bg-[var(--dash-accent-2)]">{isUploadingImage ? 'Caricamento…' : 'Scegli file'}</Button>
              </TabsContent>
            </Tabs>
          </PopoverContent>
        </Popover>
        <input type="file" accept="image/*" ref={fileInputRef} onChange={handleFileSelected} className="hidden" />
      </ToolbarSection>

      <ToolbarButton disabled={!editable} label="Annulla" active={false} onClick={() => runCommand(() => {
        if (!editor.can().undo()) return;
        editor.chain().focus().undo().run();
      })}><Undo2 className="h-4 w-4" /></ToolbarButton>
    </div>
  );
}

function TipTapEditor({ richContent, onChangeRich, editable, canToggleInlineCheckbox, autoFocus, onBlurEditor, onClickText, containerClassName }: {
  richContent: JSONContent;
  onChangeRich: (json: JSONContent) => void;
  editable: boolean;
  canToggleInlineCheckbox: boolean;
  autoFocus: boolean;
  onBlurEditor?: () => void;
  onClickText?: () => void;
  containerClassName: string;
}) {
  const [initialContent] = useState(() => flattenRemovedLayoutNodes(migrateHeadingsToFontSize(richContent)));
  const toolbarWrapRef = useRef<HTMLDivElement>(null);

  const canToggleInlineCheckboxRef = useRef(canToggleInlineCheckbox);
  canToggleInlineCheckboxRef.current = canToggleInlineCheckbox;
  const [inlineCheckboxExtension] = useState(() => InlineCheckbox.configure({
    canToggle: () => canToggleInlineCheckboxRef.current,
  }));

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
    ],
    content: initialContent,
    editable,
    editorProps: TIPTAP_EDITOR_PROPS,
    onUpdate: ({ editor }) => {
      onChangeRich(editor.getJSON());
    },
    onBlur: ({ event }) => {
      const related = event.relatedTarget as Node | null;
      if (toolbarWrapRef.current?.contains(related)) return;
      if (related instanceof Element && related.closest('[data-slot="popover-content"]')) return;
      onBlurEditor?.();
    },
  });

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
    editor.commands.setTextSelection({ from, to });
  }, [editor, richContent]);

  if (!editor) return null;

  return (
    <div ref={toolbarWrapRef} className="flex items-start gap-2">
      <Toolbar editor={editor} editable={editable} />
      <div
        onClick={!editable ? onClickText : undefined}
        className={`min-w-0 flex-1 max-w-full overflow-x-auto ${!editable && onClickText ? 'cursor-text' : ''} ${containerClassName}`}
      >
        <EditorContent editor={editor} />
      </div>
    </div>
  );
}

const DEFAULT_CONTAINER_CLASS = 'min-h-[3rem] rounded-xl border border-[var(--dash-border-soft)] bg-[var(--dash-panel)] p-3';

export function RichTextEditor({ legacyContent, richContent, onChangeRich, disabled, placeholder, className, autoFocusOnSelect, onAutoFocusConsumed }: RichTextEditorProps) {
  const [isEditing, setIsEditing] = useState(() => !!autoFocusOnSelect && !disabled);
  useEffect(() => {
    if (autoFocusOnSelect) onAutoFocusConsumed?.();
  }, []);
  const hasLegacyToProtect = richContent === null && legacyContent.trim() !== '';
  const containerClassName = className ?? DEFAULT_CONTAINER_CLASS;

  if (richContent !== null) {
    return (
      <TipTapEditor
        richContent={richContent}
        onChangeRich={onChangeRich}
        editable={!disabled && isEditing}
        canToggleInlineCheckbox={!disabled}
        autoFocus={isEditing}
        onBlurEditor={() => setIsEditing(false)}
        onClickText={!disabled ? () => setIsEditing(true) : undefined}
        containerClassName={containerClassName}
      />
    );
  }

  const viewBlock = (
    <div onClick={() => { if (!disabled) setIsEditing(true); }} className={`${!disabled ? 'cursor-text' : ''} ${containerClassName}`}>
      {legacyContent ? <MarkdownContent content={legacyContent} /> : <span className="text-sm text-[var(--dash-muted)]">{placeholder ?? 'Scrivi qui...'}</span>}
    </div>
  );

  if (disabled || !isEditing) return viewBlock;

  if (hasLegacyToProtect) {
    return (
      <div className={containerClassName}>
        <div className="mb-2 rounded-lg border border-[var(--dash-accent)]/40 bg-[var(--dash-accent)]/10 px-3 py-2 text-xs text-[var(--dash-text)]">Formato precedente — modifica per aggiornare al nuovo editor.</div>
        <MarkdownContent content={legacyContent} />
        <button type="button" onClick={() => onChangeRich(legacyToTipTapDoc(legacyContent))} className="mt-2 rounded-lg border border-[var(--dash-border-soft)] bg-[var(--dash-surface)] px-3 py-1.5 text-xs font-medium text-[var(--dash-text)] transition-colors hover:bg-[var(--dash-surface-2)]">Modifica con il nuovo editor</button>
      </div>
    );
  }

  return (
    <TipTapEditor
      richContent={{ type: 'doc', content: [{ type: 'paragraph' }] }}
      onChangeRich={onChangeRich}
      editable
      canToggleInlineCheckbox
      autoFocus
      onBlurEditor={() => setIsEditing(false)}
      containerClassName={containerClassName}
    />
  );
}
