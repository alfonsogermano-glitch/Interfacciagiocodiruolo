import { Extension } from '@tiptap/core';
import { DOMSerializer, Slice } from '@tiptap/pm/model';
import { Plugin, PluginKey } from '@tiptap/pm/state';
import type { EditorView } from '@tiptap/pm/view';
import { getRichClipboardSlice } from './noteRichClipboardSelection';
import { validateStructuralReplacement, type NoteContainerRejection } from './noteContainerPolicy';

const MIME = 'application/x-hollowgate-note+json';
const CLIPBOARD_ATTR = 'data-hollowgate-note-clipboard="1"';
const SLICE_ATTR = 'data-hollowgate-note-slice';

type SliceJSON = { content: unknown[]; openStart?: number; openEnd?: number };

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
    && (candidate.openEnd === undefined || typeof candidate.openEnd === 'number');
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
  const json = slice.toJSON() as SliceJSON;
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
            const slice = Slice.fromJSON(view.state.schema, json as any);
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
