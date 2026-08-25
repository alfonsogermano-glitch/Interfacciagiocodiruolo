import { Extension } from '@tiptap/core';
import type { Node as PMNode, ResolvedPos, Slice } from '@tiptap/pm/model';
import { Plugin, PluginKey } from '@tiptap/pm/state';
import {
  analyzeStructuralSubtree,
  canInsertStructuralSubtree,
  validateNoteContainerDocument,
  validateStructuralReplacement,
  type NoteContainerDecision,
  type NoteContainerRejection,
} from './noteContainerPolicy';

export function validateStructuralSlice($target: ResolvedPos, slice: Slice): NoteContainerDecision {
  let decision: NoteContainerDecision = { allowed: true };
  slice.content.forEach((node: PMNode) => {
    if (!decision.allowed || analyzeStructuralSubtree(node).maxRelativeDepth === 0) return;
    decision = canInsertStructuralSubtree($target, node);
  });
  return decision;
}

export const NoteContainerGuard = Extension.create<{ onReject?: (reason: NoteContainerRejection) => void }>({
  name: 'noteContainerGuard',
  addOptions() {
    return { onReject: undefined };
  },
  addProseMirrorPlugins() {
    const onReject = this.options.onReject;
    return [
      new Plugin({
        key: new PluginKey('noteContainerGuard'),
        filterTransaction: (tr) => {
          if (!tr.docChanged) return true;
          const decision = validateNoteContainerDocument(tr.doc);
          if (decision.allowed) return true;
          if ('reason' in decision) onReject?.(decision.reason);
          return false;
        },
        props: {
          handlePaste: (view, _event, slice) => {
            if (!view.editable) return true;
            const decision = validateStructuralReplacement(view.state, slice);
            if (decision.allowed) return false;
            if ('reason' in decision) onReject?.(decision.reason);
            return true;
          },
          handleDrop: (view, event, slice) => {
            if (!view.editable) return true;
            const target = view.posAtCoords({ left: event.clientX, top: event.clientY });
            if (!target) return false;
            const decision = validateStructuralSlice(view.state.doc.resolve(target.pos), slice);
            if (decision.allowed) return false;
            if ('reason' in decision) onReject?.(decision.reason);
            return true;
          },
        },
      }),
    ];
  },
});
