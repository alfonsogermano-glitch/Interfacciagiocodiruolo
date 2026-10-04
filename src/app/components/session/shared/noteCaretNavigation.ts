import { Extension } from '@tiptap/core';
import { GapCursor } from '@tiptap/pm/gapcursor';
import type { Node as PMNode } from '@tiptap/pm/model';
import { NodeSelection, Plugin, PluginKey, TextSelection, type EditorState, type Selection } from '@tiptap/pm/state';
import type { EditorView } from '@tiptap/pm/view';

export interface NoteCaretStop {
  pos: number;
  kind: 'text' | 'gap' | 'node';
}

const routes = new WeakMap<PMNode, readonly NoteCaretStop[]>();
const graphemes = new Intl.Segmenter('it', { granularity: 'grapheme' });

/** One document-order path for all four arrows, independent of DOM line wrapping. */
export function noteCaretStops(doc: PMNode): readonly NoteCaretStop[] {
  const cached = routes.get(doc);
  if (cached) return cached;
  const stops: NoteCaretStop[] = [];
  const add = (pos: number, kind: NoteCaretStop['kind']) => {
    const last = stops[stops.length - 1];
    if (last?.pos !== pos || last.kind !== kind) stops.push({ pos, kind });
  };
  const gapType = GapCursor as unknown as { valid: (pos: ReturnType<PMNode['resolve']>) => boolean };
  const visit = (node: PMNode, pos: number) => {
    if (node.isTextblock) {
      add(pos + 1, 'text');
      // Each inline atom/ZWSP is one element; combining characters and emoji
      // stay whole. Marks do not introduce extra or missing caret stops.
      let text = '';
      node.forEach(child => { text += child.isText ? child.text : '\ufffc'.repeat(child.nodeSize); });
      for (const segment of graphemes.segment(text)) {
        add(pos + 1 + segment.index + segment.segment.length, 'text');
      }
      return;
    }
    if (node.isAtom && node.type.name !== 'doc') {
      if (NodeSelection.isSelectable(node)) add(pos, 'node');
      return;
    }
    const start = node.type.name === 'doc' ? 0 : pos + 1;
    let offset = 0;
    for (let index = 0; index <= node.childCount; index += 1) {
      const before = index > 0 ? node.child(index - 1) : null;
      const after = index < node.childCount ? node.child(index) : null;
      const boundary = start + offset;
      const canInsertParagraph = !!doc.type.schema.nodes.paragraph &&
        node.canReplaceWith(index, index, doc.type.schema.nodes.paragraph);
      const framedRowGap = node.type.name === 'blockRow' && index > 0 && index < node.childCount &&
        !before?.isTextblock && !after?.isTextblock;
      // Atomic grids have no ProseMirror text inside: expose both external
      // insertion points rather than jumping over the element. Its inputs
      // retain their own keyboard behaviour.
      const atomicEdge = before?.isAtom || after?.isAtom;
      if (canInsertParagraph && (framedRowGap || atomicEdge || gapType.valid(doc.resolve(boundary)))) {
        add(boundary, 'gap');
      }
      if (!after) break;
      if (!(node.type.name === 'collapseBlock' && !node.attrs.open && after.type.name === 'collapseBody')) {
        visit(after, boundary);
      }
      offset += after.nodeSize;
    }
  };
  visit(doc, -1);
  routes.set(doc, stops);
  return stops;
}

export function nextNoteCaretSelection(state: EditorState, dir: -1 | 1): Selection | null {
  const selection = state.selection;
  if (selection instanceof TextSelection && !selection.empty) {
    return TextSelection.create(state.doc, dir > 0 ? selection.to : selection.from);
  }
  const kind = selection instanceof GapCursor ? 'gap' : selection instanceof NodeSelection ? 'node' : 'text';
  const stops = noteCaretStops(state.doc);
  // Binary search by position; the only same-position alternatives are a
  // gap before an atomic block and that block's NodeSelection.
  let low = 0;
  let high = stops.length;
  while (low < high) {
    const mid = (low + high) >>> 1;
    if (stops[mid].pos < selection.from) low = mid + 1;
    else high = mid;
  }
  let current = low;
  while (current < stops.length && stops[current].pos === selection.from && stops[current].kind !== kind) current += 1;
  const exact = stops[current]?.pos === selection.from && stops[current]?.kind === kind;
  const index = exact ? current + dir : dir > 0 ? low : low - 1;
  const stop = stops[index];
  if (!stop) return null;
  if (stop.kind === 'text') return TextSelection.create(state.doc, stop.pos);
  if (stop.kind === 'node') return NodeSelection.create(state.doc, stop.pos);
  return new GapCursor(state.doc.resolve(stop.pos));
}

function syncRowGap(view: EditorView): void {
  const gap = view.dom.querySelector<HTMLElement>('.ProseMirror-gapcursor');
  if (!gap) return;
  const selection = view.state.selection;
  if (!(selection instanceof GapCursor) || selection.$from.parent.type.name !== 'blockRow') {
    if (gap.classList.contains('note-universal-row-gap')) {
      gap.classList.remove('note-universal-row-gap');
      gap.style.left = gap.style.top = '';
    }
    return;
  }
  const $pos = selection.$from;
  const previous = $pos.nodeBefore;
  const next = $pos.nodeAfter;
  if (!previous || !next) return;
  const left = view.nodeDOM(selection.from - previous.nodeSize);
  const right = view.nodeDOM(selection.from);
  if (!(left instanceof Element) || !(right instanceof Element)) return;
  const a = left.getBoundingClientRect();
  const b = right.getBoundingClientRect();
  gap.classList.add('note-universal-row-gap');
  const parent = gap.offsetParent;
  if (!(parent instanceof HTMLElement)) return;
  const rect = parent.getBoundingClientRect();
  gap.style.left = `${(a.right + b.left) / 2 - rect.left + parent.scrollLeft}px`;
  gap.style.top = `${(Math.max(a.top, b.top) + Math.min(a.bottom, b.bottom)) / 2 - rect.top + parent.scrollTop}px`;
}

export const NoteCaretNavigation = Extension.create({
  name: 'noteCaretNavigation',
  priority: 2000,
  addProseMirrorPlugins() {
    return [new Plugin({
      key: new PluginKey('noteCaretNavigation'),
      view(view) {
        const onKeyDown = (event: KeyboardEvent) => {
          if (!view.editable || view.composing || event.isComposing || event.defaultPrevented ||
            event.shiftKey || event.altKey || event.ctrlKey || event.metaKey) return;
          const dir = event.key === 'ArrowRight' || event.key === 'ArrowDown' ? 1 :
            event.key === 'ArrowLeft' || event.key === 'ArrowUp' ? -1 : null;
          if (!dir) return;
          const target = event.target;
          if (!(target instanceof Element) || target.closest('input, textarea, select, button, [contenteditable="false"]')) return;
          if (view.dom.ownerDocument.querySelector('[data-note-slash-menu="true"]')) return;
          // Capture precedes native motion and the row/table capture handlers.
          // Consume even at the end of the path, so fallback handlers cannot
          // manufacture a different path or jump back into hidden content.
          event.preventDefault();
          event.stopImmediatePropagation();
          const next = nextNoteCaretSelection(view.state, dir);
          if (next && !next.eq(view.state.selection)) {
            view.dispatch(view.state.tr.setSelection(next).setMeta('blockRowNudge', true).scrollIntoView());
          }
        };
        view.dom.addEventListener('keydown', onKeyDown, true);
        return {
          update: syncRowGap,
          destroy: () => view.dom.removeEventListener('keydown', onKeyDown, true),
        };
      },
    })];
  },
});
