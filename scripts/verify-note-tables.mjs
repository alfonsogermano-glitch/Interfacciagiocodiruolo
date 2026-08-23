import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

let feature;
try {
  feature = await import('../src/app/components/session/shared/tiptapNoteTable.ts');
} catch (error) {
  const missingUrl = String(error?.url ?? '');
  if (error?.code === 'ERR_MODULE_NOT_FOUND' && missingUrl.endsWith('/tiptapNoteTable.ts')) {
    assert.fail('Note table core not implemented yet');
  }
  throw error;
}

const { NOTE_TABLE_CELL_CONTENT, NOTE_TABLE_EXTENSIONS, sliceContainsTable } = feature;
assert.ok(Array.isArray(NOTE_TABLE_EXTENSIONS) && NOTE_TABLE_EXTENSIONS.length >= 4, 'note table extensions must be exported');
assert.match(NOTE_TABLE_CELL_CONTENT, /textBox/, 'table cells must allow a direct TextBox');
assert.match(NOTE_TABLE_CELL_CONTENT, /collapseBlock/, 'table cells must allow a direct CollapseBlock');
assert.doesNotMatch(NOTE_TABLE_CELL_CONTENT, /(?:^|\|\s*)table(?:\s*\||$)/, 'table cell content must exclude nested table nodes');
assert.equal(typeof sliceContainsTable, 'function', 'nested-table Slice detector must be exported');

const source = await readFile(new URL('../src/app/components/session/shared/tiptapNoteTable.ts', import.meta.url), 'utf8');
assert.match(source, /insertTable\(\{\s*rows:\s*3,\s*cols:\s*3,\s*withHeaderRow:\s*false\s*\}\)/s, 'insertNoteTable must create exactly 3x3 with no header');
assert.match(source, /isSelectionInside\(state, 'table'\)/, 'table insertion must be blocked while already inside a table');
assert.match(source, /isSelectionInside\(state, 'textBox'\)/, 'table insertion must be blocked inside TextBox');
assert.match(source, /isSelectionInside\(state, 'collapseBody'\)/, 'table insertion must be blocked inside CollapseBlock body');
assert.match(source, /handlePaste/, 'nested table paste must be guarded');
assert.match(source, /handleDrop/, 'nested table drop must be guarded');

let clipboard;
try {
  clipboard = await import('../src/app/components/session/shared/noteTableClipboard.ts');
} catch (error) {
  const missingUrl = String(error?.url ?? '');
  if (error?.code === 'ERR_MODULE_NOT_FOUND' && missingUrl.endsWith('/noteTableClipboard.ts')) {
    assert.fail('Portable Note table clipboard not implemented yet');
  }
  throw error;
}

const sampleTable = {
  type: 'table',
  content: [
    {
      type: 'tableRow',
      content: [
        { type: 'tableHeader', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Nome' }] }] },
        { type: 'tableCell', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Valore' }] }] },
      ],
    },
  ],
};

const encoded = clipboard.encodeTablePayload(sampleTable);
assert.equal(typeof encoded, 'string');
assert.deepEqual(clipboard.decodeTablePayload(encoded), sampleTable, 'structured clipboard encoding must round-trip Unicode-safe JSON');
assert.equal(clipboard.tableJSONToPlainText(sampleTable), 'Nome\tValore', 'plain-text table fallback must use tabs between cells');
const markedHtml = clipboard.embedTablePayloadInHtml('<table><tbody><tr><th>Nome</th><td>Valore</td></tr></tbody></table>', sampleTable);
assert.match(markedHtml, /data-hollowgate-table-clipboard="1"/);
assert.deepEqual(clipboard.extractTablePayloadFromHtml(markedHtml), sampleTable, 'HTML marker must recover the exact Hollowgate table JSON');
assert.equal(clipboard.HOLLOWGATE_TABLE_MIME, 'web application/x-hollowgate-table+json');

const clipboardSource = await readFile(new URL('../src/app/components/session/shared/noteTableClipboard.ts', import.meta.url), 'utf8');
assert.match(clipboardSource, /text\/html/, 'clipboard write must always include HTML');
assert.match(clipboardSource, /text\/plain/, 'clipboard write must always include plain text');
assert.match(clipboardSource, /ClipboardItem\.supports/, 'custom MIME must be optional and capability-checked');
assert.match(clipboardSource, /navigator\.clipboard\.write/, 'copy must target the system\/browser clipboard');
assert.match(clipboardSource, /DOMSerializer\.fromSchema/, 'copy HTML must be serialized from the document schema, not cloned from live toolbar DOM');

let toolbarSource;
try {
  toolbarSource = await readFile(new URL('../src/app/components/session/shared/NoteTableToolbar.tsx', import.meta.url), 'utf8');
} catch (error) {
  if (error?.code === 'ENOENT') assert.fail('Contextual Note table toolbar not implemented yet');
  throw error;
}

for (const command of [
  'addRowBefore',
  'addRowAfter',
  'addColumnBefore',
  'addColumnAfter',
  'toggleHeaderRow',
  'toggleHeaderColumn',
  'deleteRow',
  'deleteColumn',
  'deleteTable',
]) {
  assert.match(toolbarSource, new RegExp(command), `contextual toolbar must expose ${command}`);
}
assert.match(toolbarSource, /writeTableToClipboard/, 'contextual toolbar must expose Copy table through the system clipboard helper');
assert.match(toolbarSource, /findActiveTable/, 'toolbar activation must derive from the current ProseMirror selection');
assert.match(toolbarSource, /selectionUpdate/, 'toolbar must track selection changes');
assert.match(toolbarSource, /position:\s*'fixed'/, 'toolbar must position itself beside the rendered active table');
assert.match(toolbarSource, /onMouseDown=\{\(event\) => event\.preventDefault\(\)\}/, 'toolbar mouse-down must preserve the current table cell selection');
assert.match(toolbarSource, /if \(!editable \|\| !activeTable \|\| !position\) return null/, 'table controls must disappear outside editable active tables');

const editorSource = await readFile(new URL('../src/app/components/session/shared/RichTextEditor.tsx', import.meta.url), 'utf8');
assert.match(editorSource, /Table2/, 'Blocchi toolbar must expose the Table2 icon');
assert.match(editorSource, /insertNoteTable\(\)/, 'Table button must invoke insertNoteTable');
assert.match(editorSource, /\.\.\.NOTE_TABLE_EXTENSIONS/, 'Note editor must register the table extensions');
assert.match(editorSource, /NoteTableClipboardPaste/, 'Note editor must register the structured clipboard paste extension');
assert.match(editorSource, /<NoteTableToolbar editor=\{editor\} editable=\{editable\}/, 'Note editor must mount the contextual table toolbar');
assert.match(editorSource, /TextAlign\.configure\(\{ types: \['paragraph'\] \}\)/, 'alignment must remain paragraph-scoped for independent lines inside cells');
assert.match(clipboardSource, /extractTablePayloadFromHtml/, 'clipboard paste extension must recover Hollowgate structured table data from HTML');
assert.match(clipboardSource, /schema\.nodeFromJSON/, 'structured table paste must rebuild through the destination editor schema');
assert.match(clipboardSource, /replaceSelectionWith/, 'structured table paste must insert the recovered table at the current selection');

const css = await readFile(new URL('../src/styles/theme.css', import.meta.url), 'utf8');
const noteTableCss = css.includes('/* Note tables */') ? css.slice(css.indexOf('/* Note tables */')) : '';
assert.match(noteTableCss, /\.tiptap-content table\.tiptap-note-table[\s\S]*?width:\s*100%/, 'Note table must fill the available Note width');
assert.match(noteTableCss, /border:\s*1px solid var\(--dash-border-soft\)/, 'Note table cells must use the active palette border token');
assert.match(noteTableCss, /\.tiptap-note-table-header[\s\S]*?background:\s*var\(--dash-surface-2\)/, 'header cells must use the active palette secondary surface');
assert.match(noteTableCss, /color:\s*var\(--dash-text\)/, 'table text must follow the active palette text color');
assert.doesNotMatch(noteTableCss, /#[0-9a-f]{3,8}/i, 'Note table styling must not hard-code palette colors');

console.log('Note table verification: PASS');
