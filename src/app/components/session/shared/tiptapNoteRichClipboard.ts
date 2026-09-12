import { Extension } from '@tiptap/core';
import { DOMSerializer, Slice } from '@tiptap/pm/model';
import { Plugin, PluginKey, type EditorState } from '@tiptap/pm/state';
import type { EditorView } from '@tiptap/pm/view';
import { getRichClipboardSlice, isRichClipboardTableSelection } from './noteRichClipboardSelection';
import { validateStructuralReplacement, validateTableClipboardTarget, type NoteContainerRejection } from './noteContainerPolicy';

const MIME = 'application/x-hollowgate-note+json';
const CLIPBOARD_ATTR = 'data-hollowgate-note-clipboard="1"';
const SLICE_ATTR = 'data-hollowgate-note-slice';

type SliceJSON = { content: unknown[]; openStart?: number; openEnd?: number; tableSelection?: boolean };

function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  for (let offset = 0; offset < bytes.length; offset += 32768) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + 32768));
  }
  return btoa(binary);
}
function base64ToBytes(value: string): Uint8Array {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return bytes;
}
function isSliceJSON(value: unknown): value is SliceJSON {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as SliceJSON;
  return Array.isArray(candidate.content)
    && (candidate.openStart === undefined || typeof candidate.openStart === 'number')
    && (candidate.openEnd === undefined || typeof candidate.openEnd === 'number')
    && (candidate.tableSelection === undefined || typeof candidate.tableSelection === 'boolean');
}
function encodeSlice(slice: SliceJSON): string {
  if (!isSliceJSON(slice)) throw new Error('Invalid Hollowgate Note slice');
  return bytesToBase64(new TextEncoder().encode(JSON.stringify(slice)));
}
function decodeSlice(encoded: string): SliceJSON | null {
  try {
    const parsed = JSON.parse(new TextDecoder().decode(base64ToBytes(encoded)));
    return isSliceJSON(parsed) ? parsed : null;
  } catch {
    return null;
  }
}
function wrapHTML(html: string, slice: SliceJSON): string {
  return `<div ${CLIPBOARD_ATTR} ${SLICE_ATTR}="${encodeSlice(slice)}">${html}</div>`;
}

// Riutilizzo per la voce "Copia" del Modificatore: scrive lo stesso formato
// dello stesso editor (slice embedded nell'HTML), cosi' l'incolla ricrea
// l'elemento identico invece di solo testo.
export type NoteClipboardSliceJSON = SliceJSON;
export function encodeNoteClipboardSlice(slice: SliceJSON): string {
  return encodeSlice(slice);
}
export function wrapNoteClipboardHTML(html: string, slice: SliceJSON): string {
  return wrapHTML(html, slice);
}
function readHTML(html: string): SliceJSON | null {
  if (!html.includes(CLIPBOARD_ATTR)) return null;
  const match = html.match(new RegExp(`${SLICE_ATTR}="([^"]+)"`));
  return match?.[1] ? decodeSlice(match[1]) : null;
}
function serializeFragment(view: EditorView, slice: Slice): string {
  const fragment = DOMSerializer.fromSchema(view.state.schema).serializeFragment(slice.content, { document });
  const div = document.createElement('div');
  div.appendChild(fragment);
  return div.innerHTML;
}
function copySelection(view: EditorView, event: ClipboardEvent): boolean {
  if (!event.clipboardData || view.state.selection.empty) return false;
  const slice = getRichClipboardSlice(view.state);
  const tableSelection = isRichClipboardTableSelection(view.state);
  const json = {
    ...(slice.toJSON() as SliceJSON),
    ...(tableSelection ? { tableSelection: true } : {}),
  };
  if (!json) return false;
  event.clipboardData.setData('text/html', wrapHTML(serializeFragment(view, slice), json));
  event.clipboardData.setData('text/plain', slice.content.textBetween(0, slice.content.size, '\n', '\n'));
  try { event.clipboardData.setData(MIME, JSON.stringify(json)); } catch { /* browser may reject custom mime */ }
  event.preventDefault();
  return true;
}
function readClipboard(event: ClipboardEvent): SliceJSON | null {
  const clipboard = event.clipboardData;
  if (!clipboard) return null;
  const custom = clipboard.getData(MIME);
  if (custom) {
    try {
      const parsed = JSON.parse(custom);
      if (isSliceJSON(parsed)) return parsed;
    } catch { /* fall back to embedded html */ }
  }
  return readHTML(clipboard.getData('text/html') ?? '');
}

// I Modificatori incollati diventano nuovi elementi: id fresco e nome
// univoco con la regola "nome intero + (n)" - SENZA togliere un eventuale
// numero gia' presente (Test (3) -> Test (3) (1), non Test (1)). Vale per
// l'incolla da voce "Copia" e per il Ctrl+V nativo, che altrimenti
// duplicherebbe nomi e chiavi widget.
function renamePastedInlineModifiers(state: EditorState, slice: Slice): Slice {
  const markType = state.schema.marks.inlineModifier;
  if (!markType) return slice;
  const used = new Set<string>();
  const MODIFIER_CHAR = String.fromCharCode(0x200b);
  state.doc.descendants((node) => {
    if (!node.isText || !node.text || !node.text.includes(MODIFIER_CHAR)) return;
    const mark = node.marks.find((item) => item.type === markType);
    if (mark) used.add(String(mark.attrs?.name ?? ''));
  });
  const freshId = (): string =>
    globalThis.crypto?.randomUUID?.() ?? `modifier-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
  let touched = false;
  const renameMarks = (marks: Array<{ type?: string; attrs?: Record<string, unknown> }> | undefined) => {
    if (!marks) return marks;
    let out = marks;
    marks.forEach((entry, index) => {
      if (!entry || entry.type !== 'inlineModifier') return;
      const current = String(entry.attrs?.name ?? '');
      let next = current;
      if (used.has(next)) {
        let candidate = 1;
        while (used.has(`${current} (${candidate})`)) candidate += 1;
        next = `${current} (${candidate})`;
      }
      used.add(next);
      const replaced = { ...entry, attrs: { ...entry.attrs, id: freshId(), name: next } };
      if (out === marks) out = marks.slice();
      out[index] = replaced;
      touched = true;
    });
    return out;
  };
  const walk = (nodes: unknown[]): unknown[] => nodes.map((child) => {
    if (!child || typeof child !== 'object') return child;
    let next = child as Record<string, unknown>;
    if (next['type'] === 'text' && Array.isArray(next['marks'])) {
      const marks = renameMarks(next['marks'] as Array<{ type?: string; attrs?: Record<string, unknown> }>);
      if (marks !== next['marks']) next = { ...next, marks };
    }
    if (Array.isArray(next['content'])) {
      const content = walk(next['content'] as unknown[]);
      next = { ...next, content };
    }
    return next;
  });
  let json: { content?: unknown; openStart?: number; openEnd?: number } | null = null;
  try {
    json = slice.toJSON() as { content?: unknown; openStart?: number; openEnd?: number };
  } catch {
    return slice;
  }
  if (!json || !Array.isArray(json.content)) return slice;
  const content = walk(json.content);
  if (!touched) return slice;
  try {
    return Slice.fromJSON(state.schema, { ...json, content } as never);
  } catch {
    return slice;
  }
}

export const NoteRichClipboard = Extension.create<{ onReject?: (reason: NoteContainerRejection) => void }>({
  name: 'noteRichClipboard',
  addOptions() { return { onReject: undefined }; },
  addProseMirrorPlugins() {
    return [new Plugin({
      key: new PluginKey('noteRichClipboard'),
      props: {
        handleDOMEvents: {
          copy: (view, event) => copySelection(view, event as ClipboardEvent),
          cut: (view, event) => {
            if (!view.editable || !copySelection(view, event as ClipboardEvent)) return false;
            view.dispatch(view.state.tr.deleteSelection().scrollIntoView());
            return true;
          },
        },
        handlePaste: (view, event) => {
          if (!view.editable) return false;
          const json = readClipboard(event);
          if (!json) return false;
          try {
            const tableClipboardDecision = validateTableClipboardTarget(view.state.selection.$from, json.tableSelection === true);
            if (!tableClipboardDecision.allowed && 'reason' in tableClipboardDecision) {
              this.options.onReject?.(tableClipboardDecision.reason);
              event.preventDefault();
              return true;
            }
            const slice = renamePastedInlineModifiers(view.state, Slice.fromJSON(view.state.schema, {
              content: json.content,
              openStart: json.openStart,
              openEnd: json.openEnd,
            } as any));
            const decision = validateStructuralReplacement(view.state, slice);
            if (!decision.allowed && 'reason' in decision) {
              this.options.onReject?.(decision.reason);
              event.preventDefault();
              return true;
            }
            event.preventDefault();
            view.dispatch(view.state.tr.replaceSelection(slice).scrollIntoView());
            return true;
          } catch {
            return false;
          }
        },
      },
    })];
  },
});
