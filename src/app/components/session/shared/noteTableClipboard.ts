import { Extension, type Editor, type JSONContent } from '@tiptap/core';
import { DOMSerializer, type Node as PMNode } from '@tiptap/pm/model';
import { Plugin, PluginKey, type EditorState } from '@tiptap/pm/state';

export const HOLLOWGATE_TABLE_MIME = 'web application/x-hollowgate-table+json';
const TABLE_CLIPBOARD_MARKER = 'data-hollowgate-table-clipboard="1"';
const TABLE_JSON_ATTRIBUTE = 'data-hollowgate-table-json';

function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  const chunkSize = 0x8000;
  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    const chunk = bytes.subarray(offset, offset + chunkSize);
    binary += String.fromCharCode(...chunk);
  }
  return btoa(binary);
}

function base64ToBytes(encoded: string): Uint8Array {
  const binary = atob(encoded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

function isTableJSON(value: unknown): value is JSONContent {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as JSONContent;
  return candidate.type === 'table' && Array.isArray(candidate.content);
}

/** UTF-8-safe transport encoding for a Hollowgate TipTap table node. */
export function encodeTablePayload(table: JSONContent): string {
  if (!isTableJSON(table)) throw new Error('Invalid Hollowgate table payload');
  const json = JSON.stringify(table);
  return bytesToBase64(new TextEncoder().encode(json));
}

export function decodeTablePayload(encoded: string): JSONContent | null {
  try {
    const json = new TextDecoder().decode(base64ToBytes(encoded));
    const parsed: unknown = JSON.parse(json);
    return isTableJSON(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function jsonNodeText(node: JSONContent): string {
  if (typeof node.text === 'string') return node.text;
  return (node.content ?? []).map(jsonNodeText).join('');
}

/** Readable tab/newline fallback used by non-rich clipboard destinations. */
export function tableJSONToPlainText(table: JSONContent): string {
  if (!isTableJSON(table)) return '';
  return (table.content ?? [])
    .map((row) =>
      (row.content ?? [])
        .map((cell) => (cell.content ?? []).map(jsonNodeText).join('\n'))
        .join('\t'),
    )
    .join('\n');
}

/**
 * Embed the exact TipTap JSON beside a conventional HTML table. Browsers and
 * external applications can ignore the wrapper attributes while another
 * Hollowgate editor can reconstruct the original rich table across tabs.
 */
export function embedTablePayloadInHtml(html: string, table: JSONContent): string {
  const encoded = encodeTablePayload(table);
  return `<div ${TABLE_CLIPBOARD_MARKER} ${TABLE_JSON_ATTRIBUTE}="${encoded}">${html}</div>`;
}

export function extractTablePayloadFromHtml(html: string): JSONContent | null {
  if (!html.includes(TABLE_CLIPBOARD_MARKER)) return null;
  const match = html.match(new RegExp(`${TABLE_JSON_ATTRIBUTE}="([^"]+)"`));
  return match?.[1] ? decodeTablePayload(match[1]) : null;
}

function serializeTableToHtml(editor: Editor, tableNode: PMNode): string {
  const rendered = DOMSerializer.fromSchema(editor.schema).serializeNode(tableNode, { document });
  const container = document.createElement('div');
  container.appendChild(rendered);
  return container.innerHTML;
}

function isSelectionInside(state: EditorState, typeName: string): boolean {
  const { $from } = state.selection;
  for (let depth = $from.depth; depth >= 0; depth -= 1) {
    if ($from.node(depth).type.name === typeName) return true;
  }
  return false;
}

function isRestrictedTablePasteDestination(state: EditorState): boolean {
  return (
    isSelectionInside(state, 'table') ||
    isSelectionInside(state, 'textBox') ||
    isSelectionInside(state, 'collapseBody') ||
    isSelectionInside(state, 'collapseSummary')
  );
}

/**
 * Recover the exact Hollowgate table JSON from the HTML clipboard marker.
 * This extension is intentionally separate from the table schema/guard
 * extension so both modules remain independently testable and the core table
 * module has no local runtime import dependency.
 */
export const NoteTableClipboardPaste = Extension.create({
  name: 'noteTableClipboardPaste',

  addProseMirrorPlugins() {
    return [
      new Plugin({
        key: new PluginKey('noteTableStructuredClipboardPaste'),
        props: {
          handlePaste: (view, event) => {
            const html = event.clipboardData?.getData('text/html') ?? '';
            const structuredTable = extractTablePayloadFromHtml(html);
            if (!structuredTable) return false;

            // Never allow a copied table to become nested in another table or
            // in the existing restricted container blocks.
            if (isRestrictedTablePasteDestination(view.state)) return true;

            try {
              const tableNode = view.state.schema.nodeFromJSON(structuredTable);
              tableNode.check();
              if (tableNode.type.name !== 'table') return false;
              const transaction = view.state.tr.replaceSelectionWith(tableNode).scrollIntoView();
              view.dispatch(transaction);
              return true;
            } catch {
              // Stale/invalid structured metadata must not block the normal
              // HTML/plain-text paste fallback that is also on the clipboard.
              return false;
            }
          },
        },
      }),
    ];
  },
});

/**
 * Copy a complete Note table to the system/browser clipboard.
 *
 * HTML + plain text are mandatory portable representations. A web custom MIME
 * payload is added only on browsers that explicitly advertise support; the
 * same structured JSON is also embedded in the HTML marker for same-site
 * round-tripping when custom MIME types are unavailable.
 */
export async function writeTableToClipboard(editor: Editor, tableNode: PMNode): Promise<void> {
  if (tableNode.type.name !== 'table') throw new Error('Active node is not a table');
  if (typeof navigator === 'undefined' || !navigator.clipboard?.write) {
    throw new Error('Clipboard API unavailable');
  }
  if (typeof ClipboardItem === 'undefined') throw new Error('ClipboardItem unavailable');

  const tableJson = tableNode.toJSON() as JSONContent;
  const html = embedTablePayloadInHtml(serializeTableToHtml(editor, tableNode), tableJson);
  const plain = tableJSONToPlainText(tableJson);
  const structured = JSON.stringify(tableJson);

  const clipboardData: Record<string, Blob> = {
    'text/html': new Blob([html], { type: 'text/html' }),
    'text/plain': new Blob([plain], { type: 'text/plain' }),
  };

  if (typeof ClipboardItem.supports === 'function' && ClipboardItem.supports(HOLLOWGATE_TABLE_MIME)) {
    clipboardData[HOLLOWGATE_TABLE_MIME] = new Blob([structured], {
      type: HOLLOWGATE_TABLE_MIME,
    });
  }

  await navigator.clipboard.write([new ClipboardItem(clipboardData)]);
}
