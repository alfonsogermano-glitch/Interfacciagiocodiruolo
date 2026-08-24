import type { Editor } from '@tiptap/react';
import type { NoteSelectionSnapshot } from './noteSelectionSnapshot';

export interface NoteRect { left: number; right: number; top: number; bottom: number }
export function placeFloatingNoteUI(rect: NoteRect, width: number, height: number, gap = 8, viewport = { width: window.innerWidth, height: window.innerHeight }) {
  const below = rect.bottom + gap;
  const above = rect.top - height - gap;
  const top = below + height <= viewport.height - 8 ? below : Math.max(8, above);
  const left = Math.max(8, Math.min(rect.left, viewport.width - width - 8));
  return { top: Math.max(8, Math.min(top, viewport.height - height - 8)), left };
}
export function getSelectionClientRect(editor: Editor, snapshot: NoteSelectionSnapshot): NoteRect {
  const nativeSelection = window.getSelection();
  if (nativeSelection?.rangeCount) {
    const range = nativeSelection.getRangeAt(0);
    const common = range.commonAncestorContainer instanceof Element ? range.commonAncestorContainer : range.commonAncestorContainer.parentElement;
    if (common && editor.view.dom.contains(common)) {
      const rect = range.getBoundingClientRect();
      if (rect.width > 0 || rect.height > 0) return { left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom };
    }
  }
  const start = editor.view.coordsAtPos(snapshot.from);
  const end = editor.view.coordsAtPos(snapshot.to);
  return { left: Math.min(start.left, end.left), right: Math.max(start.right, end.right), top: Math.min(start.top, end.top), bottom: Math.max(start.bottom, end.bottom) };
}
