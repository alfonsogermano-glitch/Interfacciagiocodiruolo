import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { Schema } from '@tiptap/pm/model';
import { EditorState, TextSelection } from '@tiptap/pm/state';
import { CellSelection, TableMap, tableNodes } from '@tiptap/pm/tables';

const tableSource = await readFile(new URL('../src/app/components/session/shared/tiptapNoteTable.ts', import.meta.url), 'utf8');
const clipboardSource = await readFile(new URL('../src/app/components/session/shared/noteTableClipboard.ts', import.meta.url), 'utf8');
const richClipboardSource = await readFile(new URL('../src/app/components/session/shared/tiptapNoteRichClipboard.ts', import.meta.url), 'utf8');
const toolbarSource = await readFile(new URL('../src/app/components/session/shared/NoteTableToolbar.tsx', import.meta.url), 'utf8');
const editorSource = await readFile(new URL('../src/app/components/session/shared/RichTextEditor.tsx', import.meta.url), 'utf8');
const css = await readFile(new URL('../src/styles/theme.css', import.meta.url), 'utf8');
const resizeCss = await readFile(new URL('../src/app/components/session/shared/noteTableResize.css', import.meta.url), 'utf8');

assert.match(tableSource, /NOTE_TABLE_CELL_CONTENT[\s\S]*textBox[\s\S]*collapseBlock/, 'cells must allow TextBox and Collapse');
assert.doesNotMatch(tableSource.match(/NOTE_TABLE_CELL_CONTENT\s*=\s*[\s\S]*?;/)?.[0] ?? '', /\|\s*table\b/, 'cells must exclude nested tables');
assert.match(tableSource, /canInsertNoteContainer\(state\.selection\.\$from, 'table'\)/, 'table insertion must use central container policy');
assert.match(tableSource, /insertTable\(\{ rows: 3, cols: 3, withHeaderRow: false \}\)/, 'table insertion must be 3x3');
assert.match(tableSource, /import ['"]\.\/noteTableResize\.css['"]/, 'table resize styles must be loaded with the table extension');
assert.match(tableSource, /resizable:\s*true/, 'Note tables must enable native mouse column resizing');
assert.match(tableSource, /NOTE_TABLE_CELL_MIN_WIDTH\s*=\s*48/, 'column resizing must preserve the existing 3rem minimum width');
assert.match(tableSource, /cellMinWidth:\s*NOTE_TABLE_CELL_MIN_WIDTH/, 'TipTap resize must use the Hollowgate minimum width');
assert.match(tableSource, /View:\s*HollowgateTableView/, 'resizable tables must use the Hollowgate TableView');
assert.match(tableSource, /class HollowgateTableView extends TableView/, 'custom TableView must preserve Hollowgate table styling and live attributes');
assert.match(tableSource, /setAttribute\('data-grid-visible'/, 'custom TableView must update grid visibility live after table transactions');
assert.match(tableSource, /columnResizingPluginKey/, 'resize bootstrap must coordinate with the native TipTap resize plugin');
assert.match(tableSource, /activeHandle[\s\S]*bootstrapRenderedColumnWidths/, 'starting a drag must freeze all rendered column widths before resizing one column');
assert.match(tableSource, /gridVisible/, 'table schema must persist grid visibility');
assert.match(tableSource, /toggleNoteTableGrid/, 'table commands must expose grid visibility toggle');

assert.match(clipboardSource, /data-hollowgate-table-clipboard/, 'portable structured table marker must remain');
assert.match(clipboardSource, /text\/html/, 'clipboard must include HTML');
assert.match(clipboardSource, /text\/plain/, 'clipboard must include plain text');
assert.match(clipboardSource, /navigator\.clipboard\.write/, 'table copy must use browser clipboard');
assert.match(clipboardSource, /canInsertStructuralSubtree/, 'structured table paste must use central policy');
assert.match(clipboardSource, /event\.preventDefault\(\)[\s\S]*return true/, 'rejected structured paste must be handled atomically');
assert.match(richClipboardSource, /getRichClipboardSlice\(view\.state\)/, 'rich copy must normalize a single-cell CellSelection before serialization');

for (const command of ['addRowBefore','addRowAfter','addColumnBefore','addColumnAfter','toggleHeaderRow','toggleHeaderColumn','deleteRow','deleteColumn','deleteTable','toggleNoteTableGrid']) {
  assert.match(toolbarSource, new RegExp(command), `table toolbar must expose ${command}`);
}
for (const icon of ['BetweenHorizontalStart','BetweenHorizontalEnd','BetweenVerticalStart','BetweenVerticalEnd']) {
  assert.match(toolbarSource, new RegExp(icon), `approved table add icon ${icon} must remain`);
}
assert.match(toolbarSource, /data-remove-table-part="row"/, 'custom row removal icon must remain');
assert.match(toolbarSource, /data-remove-table-part="column"/, 'custom column removal icon must remain');
assert.match(toolbarSource, /writeTableToClipboard/, 'table toolbar must expose copy');
assert.match(toolbarSource, /createPortal/, 'table toolbar must portal outside clipping containers');
assert.match(toolbarSource, /data-note-contextual-ui/, 'table toolbar portal must be treated as contextual editor UI');

assert.match(editorSource, /\.\.\.NOTE_TABLE_EXTENSIONS/, 'Note editor must register table schema');
assert.match(editorSource, /NoteTableClipboardPaste\.configure/, 'Note editor must register structured clipboard with rejection callback');
assert.match(editorSource, /<NoteTableToolbar/, 'Note editor must mount table toolbar');
assert.match(editorSource, /TextAlign\.configure\(\{ types: \['paragraph'\] \}\)/, 'paragraph alignment must remain cell-safe');

const tableCss = css.slice(css.indexOf('/* Note tables */'));
assert.ok(tableCss.length > 0, 'Note table CSS must live in theme.css, not a temporary workflow');
assert.match(tableCss, /\.tiptap-note-table[\s\S]*width:\s*100%/, 'unresized tables must initially fill the Note width');
assert.match(resizeCss, /table\.tiptap-note-table[\s\S]*min-width:\s*0\s*!important/, 'fixed column widths must override the legacy 100% minimum and shrink the whole table');
assert.match(resizeCss, /\.column-resize-handle[\s\S]*var\(--dash-accent/, 'column resize handle must be visible and palette-aware');
assert.match(resizeCss, /resize-cursor[\s\S]*col-resize/, 'column boundaries must expose the horizontal resize cursor');
assert.match(tableCss, /--dash-border-soft/, 'table borders must follow active palette');
assert.match(tableCss, /data-grid-visible='false'/, 'grid-hidden state must have CSS');
assert.match(tableCss, /border-color:\s*transparent/, 'hidden grid must remove cell borders');
assert.doesNotMatch(tableCss, /#[0-9a-f]{3,8}/i, 'table CSS must not hard-code palette colors');
assert.doesNotMatch(resizeCss, /#[0-9a-f]{3,8}/i, 'table resize CSS must not hard-code palette colors');


// A single-cell CellSelection is a request to copy the cell's contents, not
// the table structure that ProseMirror uses as selection context. The rich
// clipboard must strip table_row/table_cell wrappers before serializing it.
const clipboardSelectionFeature = await import('../src/app/components/session/shared/noteRichClipboardSelection.ts');
const { getRichClipboardSlice } = clipboardSelectionFeature;
assert.equal(typeof getRichClipboardSlice, 'function', 'rich clipboard must expose the single-cell normalization helper');

const behavioralTableNodes = tableNodes({ tableGroup: 'block', cellContent: 'block+' });
const behavioralSchema = new Schema({
  nodes: {
    doc: { content: 'block+' },
    paragraph: { group: 'block', content: 'inline*' },
    text: { group: 'inline' },
    ...behavioralTableNodes,
  },
});
const bp = (text = '') => behavioralSchema.nodes.paragraph.create(null, text ? behavioralSchema.text(text) : undefined);
const bcell = (text) => behavioralSchema.nodes.table_cell.create(null, [bp(text)]);
const brow = (...texts) => behavioralSchema.nodes.table_row.create(null, texts.map(bcell));
const btable = (...rows) => behavioralSchema.nodes.table.create(null, rows);
const sourceTable = btable(brow('A', 'B'), brow('C', 'D'));
const sourceDoc = behavioralSchema.nodes.doc.create(null, [sourceTable, bp('outside')]);
const sourceCellPositions = [];
const sourceTextPositions = new Map();
sourceDoc.descendants((node, pos) => {
  if (node.type.spec.tableRole === 'cell') sourceCellPositions.push(pos);
  if (node.isText && node.text) sourceTextPositions.set(node.text, pos);
});
assert.equal(sourceCellPositions.length, 4, 'fixture must expose a 2x2 table');
const singleCellSelection = new CellSelection(
  sourceDoc.resolve(sourceCellPositions[0]),
  sourceDoc.resolve(sourceCellPositions[0]),
);
const rawCellSlice = singleCellSelection.content();
assert.equal(rawCellSlice.openStart, 1, 'fixture must reproduce ProseMirror single-cell table wrappers');
assert.equal(rawCellSlice.content.firstChild?.type.spec.tableRole, 'row', 'raw single-cell selection must carry a table row wrapper');
const sourceState = EditorState.create({ schema: behavioralSchema, doc: sourceDoc, selection: singleCellSelection });
const copiedCellSlice = getRichClipboardSlice(sourceState);
assert.equal(copiedCellSlice.openStart, 0, 'single-cell copy must become a closed content slice');
assert.equal(copiedCellSlice.openEnd, 0, 'single-cell copy must become a closed content slice');
assert.equal(copiedCellSlice.content.childCount, 1, 'single-cell copy must contain only the cell block content');
assert.equal(copiedCellSlice.content.firstChild?.type.name, 'paragraph', 'single-cell copy must strip row/cell wrappers');
assert.equal(copiedCellSlice.content.textBetween(0, copiedCellSlice.content.size), 'A', 'single-cell copy must preserve the cell content');

// Pasting that normalized slice outside a table must insert ordinary content,
// not cause ProseMirror to synthesize a 1x1 table around the copied cell.
const outsideTextPos = sourceTextPositions.get('outside');
assert.equal(typeof outsideTextPos, 'number');
const outsideState = EditorState.create({
  schema: behavioralSchema,
  doc: sourceDoc,
  selection: TextSelection.create(sourceDoc, outsideTextPos + 3),
});
const outsideResult = outsideState.tr.replaceSelection(copiedCellSlice).doc;
let outsideTableCount = 0;
outsideResult.descendants((node) => { if (node.type.spec.tableRole === 'table') outsideTableCount += 1; });
assert.equal(outsideTableCount, 1, 'pasting one copied cell outside a table must not create a new 1x1 table');
assert.equal(outsideResult.firstChild?.type.spec.tableRole, 'table', 'the original table must remain present');
assert.ok(outsideResult.textContent.includes('outAside'), 'outside paste must insert the copied content as ordinary document content');

// Pasting into another cell must not add/move cells. Only the chosen target
// cell may gain the copied block; every adjacent cell must retain its content.
const targetTextPos = sourceTextPositions.get('D');
assert.equal(typeof targetTextPos, 'number');
const targetState = EditorState.create({
  schema: behavioralSchema,
  doc: sourceDoc,
  selection: TextSelection.create(sourceDoc, targetTextPos + 1),
});
const targetResult = targetState.tr.replaceSelection(copiedCellSlice).doc;
const resultTable = targetResult.firstChild;
assert.ok(resultTable && resultTable.type.spec.tableRole === 'table', 'result must still begin with the original table');
const resultMap = TableMap.get(resultTable);
assert.equal(resultMap.width, 2, 'single-cell content paste must not add or shift columns');
assert.equal(resultMap.height, 2, 'single-cell content paste must not add or shift rows');
const resultCellTexts = [];
const visitedResultCells = new Set();
for (const relativePos of resultMap.map) {
  if (visitedResultCells.has(relativePos)) continue;
  visitedResultCells.add(relativePos);
  resultCellTexts.push(resultTable.nodeAt(relativePos)?.textContent ?? '');
}
assert.deepEqual(resultCellTexts, ['A', 'B', 'C', 'DA'], 'only the chosen destination cell may receive the copied content');

// Multi-cell selections remain genuine table selections; this normalization is
// intentionally limited to exactly one selected cell.
const multiCellSelection = new CellSelection(
  sourceDoc.resolve(sourceCellPositions[0]),
  sourceDoc.resolve(sourceCellPositions[1]),
);
const multiState = EditorState.create({ schema: behavioralSchema, doc: sourceDoc, selection: multiCellSelection });
const multiSlice = getRichClipboardSlice(multiState);
assert.equal(multiSlice.content.firstChild?.type.spec.tableRole, 'row', 'multi-cell copy must retain table selection structure');

console.log('Note table verification: PASS');
