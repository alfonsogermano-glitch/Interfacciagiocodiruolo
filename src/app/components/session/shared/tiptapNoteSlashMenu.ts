import { Extension } from '@tiptap/core';
import { Plugin, PluginKey, TextSelection, type EditorState, type Transaction } from '@tiptap/pm/state';
import type { Editor } from '@tiptap/react';

interface SlashState { slashPos: number | null }
type SlashMeta = { type: 'open'; slashPos: number } | { type: 'close' };

export const noteSlashMenuPluginKey = new PluginKey<SlashState>('noteSlashMenu');
function withMeta(tr: Transaction, meta: SlashMeta) { return tr.setMeta(noteSlashMenuPluginKey, meta); }
export function getNoteSlashPosition(state: EditorState): number | null {
  return noteSlashMenuPluginKey.getState(state)?.slashPos ?? null;
}
export function isValidNoteSlashTrigger(state: EditorState, pos: number): boolean {
  return pos >= 0 && pos < state.doc.content.size && state.doc.textBetween(pos, pos + 1, '', '') === '/';
}
export function closeNoteSlashMenu(editor: Editor): void {
  editor.view.dispatch(withMeta(editor.state.tr, { type: 'close' }));
}
export function removeNoteSlashTrigger(editor: Editor, pos: number): boolean {
  const { state, view } = editor;
  if (!isValidNoteSlashTrigger(state, pos)) return false;
  const tr = state.tr.delete(pos, pos + 1);
  tr.setSelection(TextSelection.create(tr.doc, pos));
  withMeta(tr, { type: 'close' });
  view.dispatch(tr);
  return true;
}

export const NoteSlashMenuExtension = Extension.create({
  name: 'noteSlashMenu',
  addProseMirrorPlugins() {
    return [new Plugin<SlashState>({
      key: noteSlashMenuPluginKey,
      state: {
        init: () => ({ slashPos: null }),
        apply(tr, value) {
          const meta = tr.getMeta(noteSlashMenuPluginKey) as SlashMeta | undefined;
          if (meta?.type === 'open') return { slashPos: meta.slashPos };
          if (meta?.type === 'close') return { slashPos: null };
          if (value.slashPos === null || !tr.docChanged) return value;
          const mapped = tr.mapping.mapResult(value.slashPos, 1);
          return mapped.deleted ? { slashPos: null } : { slashPos: mapped.pos };
        },
      },
      props: {
        handleTextInput(view, from, to, text) {
          if (text !== '/' || !view.editable || from !== to || !view.state.selection.empty) return false;
          const tr = view.state.tr.insertText('/', from, to);
          withMeta(tr, { type: 'open', slashPos: from });
          view.dispatch(tr);
          return true;
        },
      },
    })];
  },
});
