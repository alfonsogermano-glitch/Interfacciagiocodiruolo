import type { Editor } from '@tiptap/react';
import type { LucideIcon } from 'lucide-react';
import {
  ALargeSmall,
  AlignCenter,
  AlignLeft,
  AlignRight,
  Bold,
  ChevronsDownUp,
  CircleDot,
  Image,
  Italic,
  List,
  ListOrdered,
  ListTodo,
  Minus,
  Quote,
  Shapes,
  Square,
  SquareCheckBig,
  Strikethrough,
  Table2,
  Type,
  Underline,
  Undo2,
} from 'lucide-react';
import { canInsertNoteContainer } from './noteContainerPolicy';

export type NoteCommandId =
  | 'bold' | 'italic' | 'underline' | 'strike' | 'fontSize' | 'fontFamily'
  | 'bulletList' | 'orderedList' | 'blockquote' | 'alignLeft' | 'alignCenter' | 'alignRight'
  | 'textBox' | 'collapse' | 'horizontalRule' | 'table' | 'taskList' | 'checkbox' | 'radio'
  | 'image' | 'inlineIcon' | 'undo';

export type NoteCommandGroup = 'text' | 'block' | 'history';
export type NoteSecondaryPicker = 'fontSize' | 'fontFamily' | 'image' | 'inlineIcon';

export type NoteSecondaryValue =
  | { commandId: 'fontSize'; size: number }
  | { commandId: 'fontFamily'; label: string }
  | { commandId: 'image'; src: string }
  | { commandId: 'inlineIcon'; name: string };

export interface NoteCommandDescriptor {
  id: NoteCommandId;
  label: string;
  group: NoteCommandGroup;
  icon: LucideIcon;
  selectionEligible: boolean;
  secondaryPicker?: NoteSecondaryPicker;
  canRun: (editor: Editor) => boolean;
  isActive: (editor: Editor) => boolean;
  run?: (editor: Editor) => boolean;
}

const structuralCanRun = (type: 'textBox' | 'collapseBlock' | 'table') => (editor: Editor) =>
  editor.isEditable && canInsertNoteContainer(editor.state.selection.$from, type).allowed;

export const NOTE_COMMANDS: readonly NoteCommandDescriptor[] = [
  { id: 'bold', label: 'Grassetto', group: 'text', icon: Bold, selectionEligible: true,
    canRun: (e) => e.can().toggleBold(), isActive: (e) => e.isActive('bold'), run: (e) => e.chain().focus().toggleBold().run() },
  { id: 'italic', label: 'Corsivo', group: 'text', icon: Italic, selectionEligible: true,
    canRun: (e) => e.can().toggleItalic(), isActive: (e) => e.isActive('italic'), run: (e) => e.chain().focus().toggleItalic().run() },
  { id: 'underline', label: 'Sottolineato', group: 'text', icon: Underline, selectionEligible: true,
    canRun: (e) => e.can().toggleUnderline(), isActive: (e) => e.isActive('underline'), run: (e) => e.chain().focus().toggleUnderline().run() },
  { id: 'strike', label: 'Sbarrato', group: 'text', icon: Strikethrough, selectionEligible: true,
    canRun: (e) => e.can().toggleStrike(), isActive: (e) => e.isActive('strike'), run: (e) => e.chain().focus().toggleStrike().run() },
  { id: 'fontSize', label: 'Dimensione testo', group: 'text', icon: ALargeSmall, selectionEligible: true, secondaryPicker: 'fontSize',
    canRun: (e) => e.can().setFontSize(16), isActive: () => false },
  { id: 'fontFamily', label: 'Font', group: 'text', icon: Type, selectionEligible: true, secondaryPicker: 'fontFamily',
    canRun: (e) => e.can().setFontFamily('Arial'), isActive: () => false },
  { id: 'bulletList', label: 'Elenco puntato', group: 'text', icon: List, selectionEligible: true,
    canRun: (e) => e.can().toggleBulletList(), isActive: (e) => e.isActive('bulletList'), run: (e) => e.chain().focus().toggleBulletList().run() },
  { id: 'orderedList', label: 'Elenco numerato', group: 'text', icon: ListOrdered, selectionEligible: true,
    canRun: (e) => e.can().toggleOrderedList(), isActive: (e) => e.isActive('orderedList'), run: (e) => e.chain().focus().toggleOrderedList().run() },
  { id: 'blockquote', label: 'Citazione', group: 'text', icon: Quote, selectionEligible: true,
    canRun: (e) => e.can().toggleBlockquote(), isActive: (e) => e.isActive('blockquote'), run: (e) => e.chain().focus().toggleBlockquote().run() },
  { id: 'alignLeft', label: 'Allinea a sinistra', group: 'text', icon: AlignLeft, selectionEligible: true,
    canRun: (e) => e.can().setTextAlign('left'), isActive: (e) => e.isActive({ textAlign: 'left' }), run: (e) => e.chain().focus().setTextAlign('left').run() },
  { id: 'alignCenter', label: 'Allinea al centro', group: 'text', icon: AlignCenter, selectionEligible: true,
    canRun: (e) => e.can().setTextAlign('center'), isActive: (e) => e.isActive({ textAlign: 'center' }), run: (e) => e.chain().focus().setTextAlign('center').run() },
  { id: 'alignRight', label: 'Allinea a destra', group: 'text', icon: AlignRight, selectionEligible: true,
    canRun: (e) => e.can().setTextAlign('right'), isActive: (e) => e.isActive({ textAlign: 'right' }), run: (e) => e.chain().focus().setTextAlign('right').run() },

  { id: 'textBox', label: 'Box di testo', group: 'block', icon: Square, selectionEligible: false,
    canRun: structuralCanRun('textBox'), isActive: () => false, run: (e) => e.chain().focus().setTextBox().run() },
  { id: 'collapse', label: 'Collapse (espandi/comprimi)', group: 'block', icon: ChevronsDownUp, selectionEligible: false,
    canRun: structuralCanRun('collapseBlock'), isActive: () => false, run: (e) => e.chain().focus().setCollapseBlock().run() },
  { id: 'horizontalRule', label: 'Linea orizzontale', group: 'block', icon: Minus, selectionEligible: false,
    canRun: (e) => e.can().setHorizontalRule(), isActive: () => false, run: (e) => e.chain().focus().setHorizontalRule().run() },
  { id: 'table', label: 'Tabella', group: 'block', icon: Table2, selectionEligible: false,
    canRun: structuralCanRun('table'), isActive: () => false, run: (e) => e.chain().focus().insertNoteTable().run() },
  { id: 'taskList', label: 'Attività', group: 'block', icon: ListTodo, selectionEligible: false,
    canRun: (e) => e.can().toggleTaskList(), isActive: (e) => e.isActive('taskList'), run: (e) => e.chain().focus().toggleTaskList().run() },
  { id: 'checkbox', label: 'Checkbox', group: 'block', icon: SquareCheckBig, selectionEligible: false,
    canRun: (e) => e.can().insertInlineCheckbox(), isActive: () => false, run: (e) => e.chain().focus().insertInlineCheckbox().run() },
  { id: 'radio', label: 'Radio button', group: 'block', icon: CircleDot, selectionEligible: false,
    canRun: (e) => e.can().insertInlineRadio(), isActive: () => false, run: (e) => e.chain().focus().insertInlineRadio().run() },
  { id: 'image', label: 'Immagine', group: 'block', icon: Image, selectionEligible: false, secondaryPicker: 'image',
    canRun: (e) => e.can().setImage({ src: 'about:blank' }), isActive: () => false },
  { id: 'inlineIcon', label: 'Icone', group: 'block', icon: Shapes, selectionEligible: false, secondaryPicker: 'inlineIcon',
    canRun: (e) => e.can().insertIcon('Sword'), isActive: () => false },
  { id: 'undo', label: 'Annulla', group: 'history', icon: Undo2, selectionEligible: false,
    canRun: (e) => e.can().undo(), isActive: () => false, run: (e) => e.chain().focus().undo().run() },
];

export const NOTE_COMMAND_BY_ID = new Map(NOTE_COMMANDS.map((command) => [command.id, command] as const));

export function canRunNoteCommand(editor: Editor, command: NoteCommandDescriptor): boolean {
  return editor.isEditable && command.canRun(editor);
}

export function runImmediateNoteCommand(editor: Editor, id: NoteCommandId): boolean {
  const command = NOTE_COMMAND_BY_ID.get(id);
  if (!command || command.secondaryPicker || !command.run || !canRunNoteCommand(editor, command)) return false;
  return command.run(editor);
}

export function runSlashNoteCommand(editor: Editor, id: NoteCommandId, slashPos: number): boolean {
  const command = NOTE_COMMAND_BY_ID.get(id);
  if (
    !command
    || command.secondaryPicker
    || !command.run
    || !canRunNoteCommand(editor, command)
    || slashPos < 0
    || slashPos >= editor.state.doc.content.size
    || editor.state.doc.textBetween(slashPos, slashPos + 1, '', '') !== '/'
  ) return false;

  const chain = editor.chain().deleteRange({ from: slashPos, to: slashPos + 1 });
  switch (id) {
    case 'bold': return chain.toggleBold().run();
    case 'italic': return chain.toggleItalic().run();
    case 'underline': return chain.toggleUnderline().run();
    case 'strike': return chain.toggleStrike().run();
    case 'bulletList': return chain.toggleBulletList().run();
    case 'orderedList': return chain.toggleOrderedList().run();
    case 'blockquote': return chain.toggleBlockquote().run();
    case 'alignLeft': return chain.setTextAlign('left').run();
    case 'alignCenter': return chain.setTextAlign('center').run();
    case 'alignRight': return chain.setTextAlign('right').run();
    case 'textBox': return chain.setTextBox().run();
    case 'collapse': return chain.setCollapseBlock().run();
    case 'horizontalRule': return chain.setHorizontalRule().run();
    case 'table': return chain.insertNoteTable().run();
    case 'taskList': return chain.toggleTaskList().run();
    case 'checkbox': return chain.insertInlineCheckbox().run();
    case 'radio': return chain.insertInlineRadio().run();
    case 'undo': return chain.undo().run();
    case 'fontSize':
    case 'fontFamily':
    case 'image':
    case 'inlineIcon':
      return false;
  }
}

export function runSecondaryNoteCommand(editor: Editor, value: NoteSecondaryValue): boolean {
  if (!editor.isEditable) return false;
  switch (value.commandId) {
    case 'fontSize': return editor.chain().focus().setFontSize(value.size).run();
    case 'fontFamily': return editor.chain().focus().setFontFamily(value.label).run();
    case 'image': return editor.chain().focus().setImage({ src: value.src }).run();
    case 'inlineIcon': return editor.chain().focus().insertIcon(value.name).run();
  }
}
