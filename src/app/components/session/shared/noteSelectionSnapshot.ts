import type { EditorState } from '@tiptap/pm/state';
import { TextSelection } from '@tiptap/pm/state';
import type { Node as PMNode } from '@tiptap/pm/model';
import type { Editor } from '@tiptap/react';

export interface NoteSelectionSnapshot { from: number; to: number; doc: PMNode }
export function captureNoteSelection(state: EditorState): NoteSelectionSnapshot | null {
  const { selection } = state;
  if (!(selection instanceof TextSelection) || selection.empty) return null;
  return { from: selection.from, to: selection.to, doc: state.doc };
}
export function isNoteSelectionSnapshotValid(editor: Editor, snapshot: NoteSelectionSnapshot): boolean {
  return editor.state.doc === snapshot.doc && snapshot.from >= 0 && snapshot.to > snapshot.from && snapshot.to <= editor.state.doc.content.size;
}
export function restoreNoteSelection(editor: Editor, snapshot: NoteSelectionSnapshot): boolean {
  if (!isNoteSelectionSnapshotValid(editor, snapshot)) return false;
  editor.view.dispatch(editor.state.tr.setSelection(TextSelection.create(editor.state.doc, snapshot.from, snapshot.to)));
  editor.commands.focus();
  return true;
}
export function sameNoteSelection(a: NoteSelectionSnapshot | null, b: NoteSelectionSnapshot | null): boolean {
  return !!a && !!b && a.doc === b.doc && a.from === b.from && a.to === b.to;
}
